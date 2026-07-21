'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export type NodeDTO = {
  id: string; title: string; why: string; status: string; progress: number
  nextAction: string; reviewDue: string | null; prereqs: string[]
}

export default function NodeDrawer({ slug, node, updates, onClose }:
  { slug: string; node: NodeDTO; updates: { summary: string; at: string }[]; onClose: () => void }) {
  const router = useRouter()
  const [nextAction, setNextAction] = useState(node.nextAction)
  const [directive, setDirective] = useState('')

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/nodes/${node.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    router.refresh()
  }
  async function sendIntent() {
    if (!directive.trim()) return
    await fetch(`/api/trees/${slug}/intents`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ directive, nodeId: node.id }) })
    setDirective('')
    router.refresh()
  }

  return (
    <aside className="fixed right-0 top-0 z-10 h-full w-96 overflow-y-auto border-l bg-white p-5 dark:bg-neutral-900">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">{node.title}</h2>
        <button onClick={onClose} className="text-neutral-500">✕</button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{node.why || 'No why-line yet.'}</p>
      <p className="mt-2 text-sm">{node.status} · {node.progress}% toward unlock</p>

      <label className="mt-4 block text-xs font-medium uppercase text-neutral-400">Next action (when/how)</label>
      <input value={nextAction} onChange={e => setNextAction(e.target.value)} onBlur={() => patch({ nextAction })}
        placeholder="When I next open this project, I will…"
        className="mt-1 w-full rounded border p-2 text-sm dark:bg-neutral-800" />

      <div className="mt-4 flex gap-2">
        {node.status !== 'done' && (
          <button onClick={() => patch({ progress: 100, status: 'done' })} className="rounded border px-3 py-1 text-sm">Mark done</button>
        )}
      </div>

      <label className="mt-6 block text-xs font-medium uppercase text-neutral-400">Directive for next session</label>
      <div className="mt-1 flex gap-2">
        <input value={directive} onChange={e => setDirective(e.target.value)}
          placeholder="focus this next / explain this branch…"
          className="w-full rounded border p-2 text-sm dark:bg-neutral-800" />
        <button onClick={sendIntent} className="rounded border px-3 text-sm">Queue</button>
      </div>

      <h3 className="mt-6 text-xs font-medium uppercase text-neutral-400">History</h3>
      <ul className="mt-2 space-y-2">
        {updates.map((u, i) => (
          <li key={i} className="text-sm"><span className="text-neutral-400">{u.at.slice(0, 10)}</span> {u.summary}</li>
        ))}
        {updates.length === 0 && <li className="text-sm text-neutral-400">Nothing yet.</li>}
      </ul>
    </aside>
  )
}
