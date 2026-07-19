import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applyUpdate } from '@/lib/apply-update'
import { checkBearer } from '@/lib/bearer'

export async function POST(req: NextRequest) {
  if (!checkBearer(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  await db()
  try {
    return NextResponse.json(await applyUpdate(await req.json()))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'bad payload' }, { status: 400 })
  }
}
