import Link from 'next/link'
import { getHomeData } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const d = await getHomeData()
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <nav className="flex gap-3 text-sm text-neutral-500">
          {d.trees.map(t => <Link key={t.slug} href={`/t/${t.slug}`} className="underline">{t.title}</Link>)}
          <Link href="/new" className="underline">+ tree</Link>
          <Link href="/week" className="underline">week</Link>
        </nav>
      </header>

      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-medium uppercase text-neutral-400">Resume here</h2>
        {d.resume ? (
          <Link href={`/t/${d.resume.treeSlug}`} className="mt-1 block">
            <span className="text-lg font-medium">{d.resume.title}</span>
            <span className="ml-2 text-sm text-neutral-500">{d.resume.tree} · {d.resume.progress}%</span>
            {d.resume.nextAction && <p className="text-sm text-neutral-500">→ {d.resume.nextAction}</p>}
          </Link>
        ) : <p className="mt-1 text-sm text-neutral-400">Nothing in progress. Pick something from Next up.</p>}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-medium uppercase text-neutral-400">Next up</h2>
        {d.next ? (
          <Link href={`/t/${d.next.treeSlug}`} className="mt-1 block">
            <span className="text-lg font-medium">{d.next.title}</span>
            <span className="ml-2 text-sm text-neutral-500">{d.next.tree} · {d.next.progress}% toward unlock</span>
          </Link>
        ) : <p className="mt-1 text-sm text-neutral-400">All caught up.</p>}
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="text-xs font-medium uppercase text-neutral-400">This week moved</h2>
        <ul className="mt-1 space-y-1">
          {d.weekMoved.map((u, i) => (
            <li key={i} className="text-sm"><span className="text-neutral-400">{u.tree}</span> {u.summary}</li>
          ))}
          {d.weekMoved.length === 0 && <li className="text-sm text-neutral-400">No wins logged yet this week.</li>}
        </ul>
      </section>

      {d.alert && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950">
          <h2 className="text-xs font-medium uppercase text-amber-600">Needs you</h2>
          <p className="mt-1 text-sm">{d.alert}</p>
        </section>
      )}
    </main>
  )
}
