import { verifyAuthenticationResponse } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

export async function POST(req: NextRequest) {
  await db()
  const body = await req.json()
  const expectedChallenge = req.cookies.get('pd_challenge')?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'no challenge' }, { status: 400 })
  const cred = await Credential.findOne({ credId: body.id })
  if (!cred) return NextResponse.json({ error: 'unknown credential' }, { status: 404 })
  const v = await verifyAuthenticationResponse({
    response: body,
    expectedChallenge,
    expectedOrigin: process.env.ORIGIN!,
    expectedRPID: process.env.RP_ID!,
    requireUserVerification: true,
    credential: {
      id: cred.credId,
      publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
      counter: cred.counter,
      transports: cred.transports,
    },
  })
  if (!v.verified) return NextResponse.json({ error: 'not verified' }, { status: 401 })
  await Credential.findOneAndUpdate({ credId: body.id }, { counter: v.authenticationInfo.newCounter })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
  res.cookies.delete('pd_challenge')
  return res
}
