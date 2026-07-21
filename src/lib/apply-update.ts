import { z } from 'zod'
import { Tree, TreeNode, Update, Intent } from './models'
import { computeStatuses } from './statuses'

export const UpdatePayload = z.object({
  tree: z.string(),
  sessionId: z.string().optional(),
  updates: z.array(z.object({
    node: z.string(),
    delta: z.number().min(0).max(100),
    note: z.string().min(1),
  })).default([]),
  proposed: z.array(z.object({ title: z.string(), why: z.string().optional() })).default([]),
  intentsDone: z.array(z.string()).default([]),
})

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function applyUpdate(payload: unknown) {
  const p = UpdatePayload.parse(payload)
  const tree = await Tree.findOne({ slug: p.tree })
  if (!tree) throw new Error(`unknown tree: ${p.tree}`)
  const applied: string[] = []
  const unknown: string[] = []

  for (const u of p.updates) {
    const node = await TreeNode.findOne({ treeId: tree._id, title: new RegExp(`^${escapeRe(u.node)}$`, 'i') })
    if (!node) { unknown.push(u.node); tree.proposed.push({ title: u.node, why: u.note }); continue }
    node.progress = Math.min(100, node.progress + u.delta)
    node.status = node.progress >= 100 ? 'done' : node.progress > 0 ? 'in_progress' : node.status
    await node.save()
    await Update.create({ nodeId: node._id, treeId: tree._id, sessionId: p.sessionId, summary: u.note, delta: u.delta, source: 'session' })
    applied.push(node.title)
  }
  for (const pr of p.proposed) tree.proposed.push({ title: pr.title, why: pr.why ?? '' })
  await tree.save()
  const intentIds = p.intentsDone.filter(id => /^[0-9a-f]{24}$/i.test(id))
  if (intentIds.length) await Intent.updateMany({ _id: { $in: intentIds } }, { status: 'done' })

  const nodes = await TreeNode.find({ treeId: tree._id })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => {
    const s = st.get(String(x._id))!
    if (s !== x.status) { x.status = s; return x.save() }
  }))
  return { applied, unknown }
}
