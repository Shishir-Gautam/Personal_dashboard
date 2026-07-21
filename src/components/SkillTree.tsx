'use client'
import { ReactFlow, Background, Handle, Position, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo, useState } from 'react'
import { layoutTree } from '@/lib/layout'
import NodeDrawer, { type NodeDTO } from './NodeDrawer'

const STATUS_STYLE: Record<string, string> = {
  locked: 'opacity-40 border-dashed',
  available: 'border-neutral-400',
  in_progress: 'border-amber-500 shadow-md',
  done: 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950',
}

function SkillNode({ data }: NodeProps) {
  const d = data as unknown as NodeDTO & { onOpen: (n: NodeDTO) => void }
  return (
    <button onClick={() => d.onOpen(d)}
      className={`w-[190px] rounded-lg border-2 bg-white p-2 text-left dark:bg-neutral-900 ${STATUS_STYLE[d.status]}`}>
      <Handle type="target" position={Position.Top} className="invisible" />
      <div className="truncate text-sm font-medium">{d.title}</div>
      {d.status !== 'done' && d.status !== 'locked' && (
        <div className="mt-1 h-1.5 rounded bg-neutral-200 dark:bg-neutral-700">
          <div className="h-1.5 rounded bg-amber-500" style={{ width: `${d.progress}%` }} />
        </div>
      )}
      {d.status === 'done' && <div className="text-xs text-emerald-700">done</div>}
      <Handle type="source" position={Position.Bottom} className="invisible" />
    </button>
  )
}

export default function SkillTree({ slug, nodes, updatesByNode }:
  { slug: string; nodes: NodeDTO[]; updatesByNode: Record<string, { summary: string; at: string }[]> }) {
  const [open, setOpen] = useState<NodeDTO | null>(null)
  const flow = useMemo(() => {
    const edges = nodes.flatMap(n => n.prereqs.map(p => ({ id: `${p}-${n.id}`, source: p, target: n.id })))
    const laid = layoutTree(nodes.map(n => ({ ...n, onOpen: setOpen })), edges)
    return {
      nodes: laid.map(n => ({ id: n.id, type: 'skill', position: n.position, data: n as unknown as Record<string, unknown> })),
      edges,
    }
  }, [nodes])
  return (
    <div className="h-[calc(100vh-3rem)]">
      <ReactFlow nodeTypes={{ skill: SkillNode }} nodes={flow.nodes} edges={flow.edges} fitView proOptions={{ hideAttribution: true }}>
        <Background />
      </ReactFlow>
      {open && <NodeDrawer slug={slug} node={open} updates={updatesByNode[open.id] ?? []} onClose={() => setOpen(null)} />}
    </div>
  )
}
