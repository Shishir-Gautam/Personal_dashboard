import { verifyAuthenticationResponse, type AuthenticationResponseJSON, type AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'
import { webauthnEnv } from '@/lib/webauthn-env'

export async function POST(req: NextRequest) {
  await db()
  let body: AuthenticationResponseJSON
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad payload' }, { status: 400 })
  }
  const expectedChallenge = req.cookies.get('pd_challenge')?.value
  if (!expectedChallenge) return NextResponse.json({ error: 'no challenge' }, { status: 400 })
  const cred = await Credential.findOne({ credId: body.id })
  if (!cred) return NextResponse.json({ error: 'unknown credential' }, { status: 404 })
  const { rpID, origin } = webauthnEnv()
  let v
  try {
    v = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: cred.credId,
        publicKey: new Uint8Array(Buffer.from(cred.publicKey, 'base64url')),
        counter: cred.counter,
        transports: cred.transports as AuthenticatorTransportFuture[],
      },
    })
  } catch {
    return NextResponse.json({ error: 'not verified' }, { status: 400 })
  }
  if (!v.verified) return NextResponse.json({ error: 'not verified' }, { status: 401 })
  await Credential.findOneAndUpdate({ credId: body.id }, { counter: v.authenticationInfo.newCounter })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
  res.cookies.delete('pd_challenge')
  return res
}
