'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function NewTree() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [kind, setKind] = useState<'project' | 'life' | 'course'>('project')
  const [outline, setOutline] = useState('- First milestone\n  - Depends on first\n- Independent branch')
  const [err, setErr] = useState('')

  async function create() {
    setErr('')
    const res = await fetch('/api/trees', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, slug, kind, outline }),
    })
    if (!res.ok) { setErr((await res.json()).error ?? 'failed'); return }
    router.push(`/t/${slug}`)
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">New tree</h1>
      <input value={title} onChange={e => { setTitle(e.target.value); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) }}
        placeholder="Title" className="w-full rounded border p-2 dark:bg-neutral-800" />
      <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="slug" className="w-full rounded border p-2 dark:bg-neutral-800" />
      <select value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="w-full rounded border p-2 dark:bg-neutral-800">
        <option value="project">project</option><option value="life">life</option><option value="course">course</option>
      </select>
      <p className="text-xs text-neutral-500">Markdown outline. 2-space indent = needs the node above it. A done &quot;Setup&quot; root is added for you.</p>
      <textarea value={outline} onChange={e => setOutline(e.target.value)} rows={10} className="w-full rounded border p-2 font-mono text-sm dark:bg-neutral-800" />
      <button onClick={create} className="rounded border px-4 py-2">Create</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </main>
  )
}
