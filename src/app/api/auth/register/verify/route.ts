import { verifyRegistrationResponse } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

export async function POST(req: NextRequest) {
  await db()
  if ((await Credential.countDocuments()) > 0)
    return NextResponse.json({ error: 'already registered' }, { status: 403 })
  const expectedChallenge = req.cookies.get('pd_challenge')?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'no challenge' }, { status: 400 })
  const v = await verifyRegistrationResponse({
    response: await req.json(),
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    requireUserVerification: true,
  })
  if (!v.verified || !v.registrationInfo) return NextResponse.json({ error: 'not verified' }, { status: 400 })
  const { credential } = v.registrationInfo
  await Credential.create({
    credId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? [],
  })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
  res.cookies.delete('pd_challenge')
  return res
}
