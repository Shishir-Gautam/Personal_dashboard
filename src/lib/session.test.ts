import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import { signSession, verifySession, SESSION_TTL_S } from './session'

describe('session', () => {
  it('signs and verifies', async () => {
    expect(await verifySession(await signSession())).toBe(true)
  })
  it('rejects garbage and tampered tokens', async () => {
    expect(await verifySession('nope')).toBe(false)
    const t = await signSession()
    expect(await verifySession(t.slice(0, -2) + 'xx')).toBe(false)
  })
  it('has a 30-minute TTL', () => {
    expect(SESSION_TTL_S).toBe(1800)
  })
  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000)
    const secret = new TextEncoder().encode(process.env.SESSION_SECRET!)
    const expired = await new SignJWT({ u: 'owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 1800)
      .sign(secret)
    expect(await verifySession(expired)).toBe(false)
  })
})
