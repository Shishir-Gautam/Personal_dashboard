import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Tree, Intent } from '@/lib/models'
import { checkBearer } from '@/lib/bearer'

export async function GET(req: NextRequest) {
  if (!checkBearer(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await db()
  const slug = req.nextUrl.searchParams.get('project')
  const tree = await Tree.findOne({ slug })
  if (!tree) return NextResponse.json({ error: `unknown tree: ${slug}` }, { status: 404 })
  const pending = await Intent.find({ treeId: tree._id, status: 'pending' }).populate('nodeId', 'title')
  const intents = pending.map(i => ({
    id: String(i._id),
    node: i.nodeId ? (i.nodeId as unknown as { title: string }).title : null,
    directive: i.directive,
  }))
  await Intent.updateMany(
    { _id: { $in: pending.map(i => i._id) } },
    { status: 'delivered', deliveredAt: new Date() },
  )
  return NextResponse.json({ intents })
}
