import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { POST as regOptions } from './register/options/route'

describe('webauthn registration options', () => {
  it('returns options with challenge and sets challenge cookie when no credential exists', async () => {
    await db()
    const res = await regOptions()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.challenge).toBeTruthy()
    expect(body.rp.id).toBe('localhost')
    expect(res.headers.get('set-cookie')).toContain('pd_challenge=')
  })
  it('refuses when a credential already exists', async () => {
    await db()
    await Credential.create({ credId: 'x', publicKey: 'x', counter: 0 })
    const res = await regOptions()
    expect(res.status).toBe(403)
  })
})
