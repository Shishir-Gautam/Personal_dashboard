import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { TreeNode } from '@/lib/models'
import { computeStatuses } from '@/lib/statuses'

const Body = z.object({
  nextAction: z.string().optional(),
  why: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(['locked', 'available', 'in_progress', 'done']).optional(),
  reviewDue: z.string().datetime().nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await db()
  const { id } = await params
  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  const node = await TreeNode.findById(id)
  if (!node) return NextResponse.json({ error: 'not found' }, { status: 404 })
  Object.assign(node, parsed.data, parsed.data.reviewDue !== undefined ? { reviewDue: parsed.data.reviewDue ? new Date(parsed.data.reviewDue) : undefined } : {})
  await node.save()
  const nodes = await TreeNode.find({ treeId: node.treeId })
  const st = computeStatuses(nodes.map(x => ({ id: String(x._id), status: x.status, progress: x.progress, prereqs: x.prereqs.map(String) })))
  await Promise.all(nodes.map(x => { const s = st.get(String(x._id))!; if (s !== x.status) { x.status = s; return x.save() } }))
  return NextResponse.json({ ok: true })
}
