import { generateRegistrationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { webauthnEnv } from '@/lib/webauthn-env'

export async function POST() {
  await db()
  if ((await Credential.countDocuments()) > 0)
    return NextResponse.json({ error: 'already registered — sign in instead' }, { status: 403 })
  const { rpID } = webauthnEnv()
  const options = await generateRegistrationOptions({
    rpName: 'Personal Dashboard',
    rpID,
    userName: 'owner',
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
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
