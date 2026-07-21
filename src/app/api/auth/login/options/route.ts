import { generateAuthenticationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { webauthnEnv } from '@/lib/webauthn-env'

export async function POST() {
  await db()
  const creds = await Credential.find()
  if (creds.length === 0) return NextResponse.json({ error: 'no passkey registered' }, { status: 404 })
  const { rpID } = webauthnEnv()
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: creds.map(c => ({ id: c.credId, transports: c.transports })),
  })
  const res = NextResponse.json(options)
  res.cookies.set('pd_challenge', options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  })
  return res
}
