import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { Reflection } from '@/lib/models'
import { mondayOf } from '@/lib/queries'

export async function POST(req: NextRequest) {
  await db()
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const parsed = z.object({ body: z.string().min(1) }).safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: 'bad payload' }, { status: 400 })

  try {
    await Reflection.findOneAndUpdate({ weekStart: mondayOf() }, { body: parsed.data.body }, { upsert: true })
  } catch (e) {
    const err = e as Record<string, unknown>
    if (err.code === 11000 || (err.cause as Record<string, unknown>)?.code === 11000) {
      // Retry once on E11000 duplicate key race condition
      await Reflection.findOneAndUpdate({ weekStart: mondayOf() }, { body: parsed.data.body }, { upsert: true })
    } else {
      throw e
    }
  }

  return NextResponse.json({ ok: true })
}
