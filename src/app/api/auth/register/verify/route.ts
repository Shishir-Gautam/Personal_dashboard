import { verifyRegistrationResponse, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'
import { webauthnEnv } from '@/lib/webauthn-env'

export async function POST(req: NextRequest) {
  await db()
  if ((await Credential.countDocuments()) > 0)
    return NextResponse.json({ error: 'already registered' }, { status: 403 })
  const expectedChallenge = req.cookies.get('pd_challenge')?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'no challenge' }, { status: 400 })
  let body: RegistrationResponseJSON
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const { rpID, origin } = webauthnEnv()
  let v
  try {
    v = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    })
  } catch {
    return NextResponse.json({ error: 'not verified' }, { status: 400 })
  }
  if (!v.verified || !v.registrationInfo) return NextResponse.json({ error: 'not verified' }, { status: 400 })
  const { credential } = v.registrationInfo
  try {
    await Credential.create({
      credId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
    })
  } catch (err: unknown) {
    // Unique index on `owner` enforces the single-passkey invariant at the DB
    // layer: a concurrent registration that raced past the countDocuments()
    // check above still can't create a second credential.
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code?: number }).code === 11000)
      return NextResponse.json({ error: 'already registered' }, { status: 403 })
    throw err
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
  res.cookies.delete('pd_challenge')
  return res
}
