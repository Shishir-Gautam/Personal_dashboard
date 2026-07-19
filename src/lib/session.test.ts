import { describe, it, expect } from 'vitest'
import { signSession, verifySession } from './session'

describe('session', () => {
  it('signs and verifies', async () => {
    expect(await verifySession(await signSession())).toBe(true)
  })
  it('rejects garbage and tampered tokens', async () => {
    expect(await verifySession('nope')).toBe(false)
    const t = await signSession()
    expect(await verifySession(t.slice(0, -2) + 'xx')).toBe(false)
  })
})
