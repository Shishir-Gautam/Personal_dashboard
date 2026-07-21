import { db } from './db'
import { Tree, TreeNode, Update } from './models'

export async function getTreeData(slug: string) {
  await db()
  const tree = await Tree.findOne({ slug }).lean()
  if (!tree) return null
  const nodes = await TreeNode.find({ treeId: tree._id }).lean()
  const updates = await Update.find({ treeId: tree._id }).sort('-createdAt').limit(200).lean()
  const updatesByNode: Record<string, { summary: string; at: string }[]> = {}
  for (const u of updates) {
    const k = String(u.nodeId ?? '')
    ;(updatesByNode[k] ??= []).push({ summary: u.summary, at: (u as { createdAt: Date }).createdAt.toISOString() })
  }
  return {
    tree: { slug: tree.slug, title: tree.title, kind: tree.kind, proposed: (tree.proposed ?? []).map(p => ({ title: p.title, why: p.why ?? '' })) },
    nodes: nodes.map(x => ({
      id: String(x._id), title: x.title, why: x.why, status: x.status, progress: x.progress,
      nextAction: x.nextAction, reviewDue: x.reviewDue?.toISOString() ?? null, prereqs: (x.prereqs ?? []).map(String),
    })),
    updatesByNode,
  }
}
