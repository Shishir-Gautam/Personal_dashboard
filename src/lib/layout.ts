import dagre from '@dagrejs/dagre'

export function layoutTree<T extends { id: string }>(nodes: T[], edges: { source: string; target: string }[]) {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach(n => g.setNode(n.id, { width: 190, height: 70 }))
  edges.forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => ({ ...n, position: { x: g.node(n.id).x - 95, y: g.node(n.id).y - 35 } }))
}
