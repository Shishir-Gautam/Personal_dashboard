import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Reflection } from '@/lib/models'
import { mondayOf } from '@/lib/queries'

export async function POST(req: NextRequest) {
  await db()
  const parsed = z.object({ body: z.string().min(1) }).safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  await Reflection.findOneAndUpdate({ weekStart: mondayOf() }, { body: parsed.data.body }, { upsert: true })
  return NextResponse.json({ ok: true })
}
