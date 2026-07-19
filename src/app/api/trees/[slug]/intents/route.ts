import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Tree, Intent } from '@/lib/models'

const Body = z.object({
  directive: z.string().min(1),
  nodeId: z.string().regex(/^[0-9a-f]{24}$/i).optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  await db()
  const { slug } = await params
  const tree = await Tree.findOne({ slug })
  if (!tree) return NextResponse.json({ error: 'unknown tree' }, { status: 404 })
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  const intent = await Intent.create({ treeId: tree._id, nodeId: parsed.data.nodeId, directive: parsed.data.directive })
  return NextResponse.json({ id: String(intent._id) })
}
