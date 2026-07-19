import { generateRegistrationOptions } from '@simplewebauthn/server'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'

export async function POST() {
  await db()
  if ((await Credential.countDocuments()) > 0)
    return NextResponse.json({ error: 'already registered — sign in instead' }, { status: 403 })
  const options = await generateRegistrationOptions({
    rpName: 'Personal Dashboard',
    rpID: process.env.RP_ID!,
    userName: 'owner',
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
  })
  const res = NextResponse.json(options)
  res.cookies.set('pd_challenge', options.challenge, { httpOnly: true, maxAge: 300, path: '/' })
  return res
}
