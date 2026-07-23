// Import a rich tree definition from JSON. Replaces any existing tree with the same slug.
// Usage: npx tsx --env-file=.env scripts/import-tree.ts trees/xnock.json
import fs from 'fs'
import mongoose from 'mongoose'
import { db } from '../src/lib/db'
import { Tree, TreeNode, Update, Intent } from '../src/lib/models'
import { computeStatuses } from '../src/lib/statuses'

type NodeDef = {
  id: string
  title: string
  why?: string
  status?: 'locked' | 'available' | 'in_progress' | 'done'
  progress?: number
  nextAction?: string
  prereqs?: string[]
  note?: string
}
type TreeDef = { slug: string; title: string; kind: 'project' | 'life' | 'course'; nodes: NodeDef[] }

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('usage: import-tree.ts <tree.json>')
  const def: TreeDef = JSON.parse(fs.readFileSync(file, 'utf8'))
  await db()

  const existing = await Tree.findOne({ slug: def.slug })
  if (existing) {
    await TreeNode.deleteMany({ treeId: existing._id })
    await Update.deleteMany({ treeId: existing._id })
    await Intent.deleteMany({ treeId: existing._id })
    await Tree.deleteOne({ _id: existing._id })
    console.log(`replaced existing tree '${def.slug}'`)
  }

  const tree = await Tree.create({ slug: def.slug, title: def.title, kind: def.kind })
  const idMap = new Map<string, mongoose.Types.ObjectId>()

  for (const n of def.nodes) {
    const doc = await TreeNode.create({
      treeId: tree._id,
      title: n.title,
      why: n.why ?? '',
      status: n.status ?? 'locked',
      progress: typeof n.progress === 'number' ? Math.max(0, Math.min(100, n.progress)) : n.status === 'done' ? 100 : 0,
      nextAction: n.nextAction ?? '',
      prereqs: [],
    })
    idMap.set(n.id, doc._id)
    if (n.note) {
      await Update.create({ nodeId: doc._id, treeId: tree._id, summary: n.note, delta: 0, source: 'manual' })
    }
  }
  for (const n of def.nodes) {
    if (!n.prereqs?.length) continue
    const prereqs = n.prereqs.map(p => {
      const oid = idMap.get(p)
      if (!oid) throw new Error(`node '${n.id}' references unknown prereq '${p}'`)
      return oid
    })
    await TreeNode.updateOne({ _id: idMap.get(n.id) }, { prereqs })
  }

  const nodes = await TreeNode.find({ treeId: tree._id })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => {
    const s = st.get(String(x._id))!
    if (s !== x.status) { x.status = s; return x.save() }
  }))
  console.log(`imported '${def.slug}' with ${def.nodes.length} nodes`)
}

main().then(() => mongoose.disconnect()).catch(e => { console.error(e); process.exit(1) })
