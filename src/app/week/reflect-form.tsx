'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function ReflectForm({ existing }: { existing: string | null }) {
  const router = useRouter()
  const [body, setBody] = useState(existing ?? '')
  const [saved, setSaved] = useState(!!existing)
  async function save() {
    if (!body.trim()) return
    await fetch('/api/reflections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })
    setSaved(true); router.refresh()
  }
  return (
    <section className={`rounded-xl border p-4 ${saved ? 'border-emerald-300' : 'border-amber-300'}`}>
      <h2 className="text-xs font-medium uppercase text-neutral-400">
        {saved ? 'Week closed — reflection saved' : 'Close the week: one line — what did you learn?'}
      </h2>
      <div className="mt-2 flex gap-2">
        <input value={body} onChange={e => setBody(e.target.value)} className="w-full rounded border p-2 text-sm dark:bg-neutral-800" />
        <button onClick={save} className="rounded border px-3 text-sm">Save</button>
      </div>
    </section>
  )
}
