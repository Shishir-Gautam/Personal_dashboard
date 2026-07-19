import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Tree } from '@/lib/models'
import { importTree } from '@/lib/importer'

const Body = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(['project', 'life', 'course']),
  outline: z.string(),
})

export async function GET() {
  await db()
  const trees = await Tree.find().sort('-updatedAt')
  return NextResponse.json(trees.map(t => ({ slug: t.slug, title: t.title, kind: t.kind })))
}

export async function POST(req: NextRequest) {
  await db()
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const parsed = Body.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  if (await Tree.findOne({ slug: parsed.data.slug }))
    return NextResponse.json({ error: 'slug taken' }, { status: 409 })
  try {
    return NextResponse.json(await importTree(parsed.data))
  } catch (e) {
    const err = e as Record<string, unknown>
    if (err.code === 11000 || (err.cause as Record<string, unknown>)?.code === 11000)
      return NextResponse.json({ error: 'slug taken' }, { status: 409 })
    throw e
  }
}
