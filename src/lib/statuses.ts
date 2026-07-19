export type StatusInput = { id: string; status: string; progress: number; prereqs: string[] }
export type NodeStatus = 'locked' | 'available' | 'in_progress' | 'done'

export function computeStatuses(nodes: StatusInput[]): Map<string, NodeStatus> {
  const done = new Set(nodes.filter(x => x.status === 'done' || x.progress >= 100).map(x => x.id))
  const out = new Map<string, NodeStatus>()
  for (const x of nodes) {
    if (done.has(x.id)) out.set(x.id, 'done')
    else if (x.progress > 0) out.set(x.id, 'in_progress')
    else if (x.prereqs.every(p => done.has(p))) out.set(x.id, 'available')
    else out.set(x.id, 'locked')
  }
  return out
}
