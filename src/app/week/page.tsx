import { getWeekData } from '@/lib/queries'
import ReflectForm from './reflect-form'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Week() {
  const d = await getWeekData()
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Week of {d.weekStart.slice(0, 10)}</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">Home</Link>
      </header>
      {d.byTree.map(g => (
        <section key={g.tree} className="rounded-xl border p-4">
          <h2 className="font-medium">{g.tree}</h2>
          <ul className="mt-1 space-y-1">
            {g.items.map((u, i) => <li key={i} className="text-sm">{u.summary}</li>)}
          </ul>
        </section>
      ))}
      {d.byTree.length === 0 && <p className="text-sm text-neutral-400">Nothing moved yet this week.</p>}
      <ReflectForm existing={d.reflection} />
    </main>
  )
}
