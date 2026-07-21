import { db } from './db'
import { Tree, TreeNode, Update, Intent, Reflection } from './models'

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

export function mondayOf(d = new Date()) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

export async function getHomeData() {
  await db()
  const trees = await Tree.find().sort('-updatedAt').lean()
  const byId = Object.fromEntries(trees.map(t => [String(t._id), t]))
  const card = (n: { _id: unknown; title: string; treeId: unknown; progress: number; nextAction: string }) => ({
    id: String(n._id), title: n.title, tree: byId[String(n.treeId)]?.title ?? '', treeSlug: byId[String(n.treeId)]?.slug ?? '',
    progress: n.progress, nextAction: n.nextAction,
  })
  const resume = await TreeNode.findOne({ status: 'in_progress' }).sort('-updatedAt').lean()
  const next = await TreeNode.findOne({ status: 'available' }).sort('-updatedAt').lean()
  const weekUpdates = await Update.find({ createdAt: { $gte: mondayOf() } }).sort('-createdAt').limit(5).lean()
  const pendingIntent = await Intent.findOne({ status: 'pending' }).sort('createdAt').lean()
  const overdue = await TreeNode.findOne({ reviewDue: { $lte: new Date() }, status: { $ne: 'done' } }).lean()
  return {
    resume: resume ? card(resume) : null,
    next: next ? card(next) : null,
    weekMoved: weekUpdates.map(u => ({ tree: byId[String(u.treeId)]?.title ?? '', summary: u.summary, at: (u as { createdAt: Date }).createdAt.toISOString() })),
    alert: overdue ? `Review due: ${overdue.title}` : pendingIntent ? `Intent waiting: ${pendingIntent.directive}` : null,
    trees: trees.map(t => ({ slug: t.slug, title: t.title, kind: t.kind })),
  }
}

export async function getWeekData() {
  await db()
  const weekStart = mondayOf()
  const updates = await Update.find({ createdAt: { $gte: weekStart } }).sort('-createdAt').lean()
  const trees = await Tree.find().lean()
  const byId = Object.fromEntries(trees.map(t => [String(t._id), t.title]))
  const grouped: Record<string, { summary: string; at: string }[]> = {}
  for (const u of updates)
    (grouped[byId[String(u.treeId)] ?? '?'] ??= []).push({ summary: u.summary, at: (u as { createdAt: Date }).createdAt.toISOString() })
  const reflection = await Reflection.findOne({ weekStart }).lean()
  return {
    weekStart: weekStart.toISOString(),
    byTree: Object.entries(grouped).map(([tree, items]) => ({ tree, items })),
    reflection: reflection?.body ?? null,
  }
}
