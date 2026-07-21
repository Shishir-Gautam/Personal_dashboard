import { notFound } from 'next/navigation'
import { getTreeData } from '@/lib/queries'
import SkillTree from '@/components/SkillTree'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function TreePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getTreeData(slug)
  if (!data) notFound()
  return (
    <main>
      <header className="flex h-12 items-center gap-4 border-b px-4">
        <Link href="/" className="text-sm text-neutral-500">← Home</Link>
        <h1 className="font-semibold">{data.tree.title}</h1>
        {data.tree.proposed.length > 0 && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            {data.tree.proposed.length} proposed node(s): {data.tree.proposed.map(p => p.title).join(', ')}
          </span>
        )}
      </header>
      <SkillTree slug={slug} nodes={data.nodes} updatesByNode={data.updatesByNode} />
    </main>
  )
}
