import { Tree, TreeNode } from './models'
import { computeStatuses } from './statuses'

export function parseOutline(md: string): { title: string; depth: number }[] {
  return md.split('\n')
    .map(l => { const m = l.match(/^(\s*)-\s+(.+)$/); return m ? { depth: Math.floor(m[1].length / 2), title: m[2].trim() } : null })
    .filter((x): x is { title: string; depth: number } => x !== null)
}

export async function importTree(input: { slug: string; title: string; kind: 'project' | 'life' | 'course'; outline: string }) {
  const tree = await Tree.create({ slug: input.slug, title: input.title, kind: input.kind })
  const setup = await TreeNode.create({ treeId: tree._id, title: 'Setup', why: 'Groundwork already done by creating this tree.', status: 'done', progress: 100 })
  const stack: { depth: number; id: string }[] = []
  for (const item of parseOutline(input.outline)) {
    while (stack.length && stack[stack.length - 1].depth >= item.depth) stack.pop()
    const prereq = stack.length ? stack[stack.length - 1].id : String(setup._id)
    const node = await TreeNode.create({ treeId: tree._id, title: item.title, prereqs: [prereq] })
    stack.push({ depth: item.depth, id: String(node._id) })
  }
  const nodes = await TreeNode.find({ treeId: tree._id })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => { const s = st.get(String(x._id))!; if (s !== x.status) { x.status = s; return x.save() } }))
  return { treeId: String(tree._id), nodeCount: nodes.length }
}
