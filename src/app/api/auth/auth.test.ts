import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Credential } from '@/lib/models'
import { POST as regOptions } from './register/options/route'
import { POST as regVerify } from './register/verify/route'
import { POST as loginOptions } from './login/options/route'
import { POST as loginVerify } from './login/verify/route'

const jsonReq = (url: string, body: unknown, cookie?: string) =>
  new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  })

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

describe('webauthn registration verify', () => {
  it('400 when no pd_challenge cookie', async () => {
    await db()
    const req = jsonReq('http://localhost:3000/api/auth/register/verify', {})
    const res = await regVerify(req)
    expect(res.status).toBe(400)
  })
  it('403 when a credential already exists', async () => {
    await db()
    await Credential.create({ credId: 'x', publicKey: 'x', counter: 0 })
    const req = jsonReq('http://localhost:3000/api/auth/register/verify', {}, 'pd_challenge=x')
    const res = await regVerify(req)
    expect(res.status).toBe(403)
  })
})

describe('webauthn login options', () => {
  it('404 with empty credential collection', async () => {
    await db()
    const res = await loginOptions()
    expect(res.status).toBe(404)
  })
  it('200 + challenge + allowCredentials containing the stored credId when one exists', async () => {
    await db()
    await Credential.create({ credId: 'abc123', publicKey: 'x', counter: 0 })
    const res = await loginOptions()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.challenge).toBeTruthy()
    expect(body.allowCredentials.some((c: { id: string }) => c.id === 'abc123')).toBe(true)
  })
})

describe('webauthn login verify', () => {
  it('400 when no challenge cookie', async () => {
    await db()
    const req = jsonReq('http://localhost:3000/api/auth/login/verify', { id: 'x' })
    const res = await loginVerify(req)
    expect(res.status).toBe(400)
  })
  it('404 for unknown credential id (with challenge cookie set)', async () => {
    await db()
    const req = jsonReq('http://localhost:3000/api/auth/login/verify', { id: 'unknown' }, 'pd_challenge=x')
    const res = await loginVerify(req)
    expect(res.status).toBe(404)
  })
})

describe('credential singleton invariant', () => {
  it('allows exactly one of two concurrent credential creations to succeed', async () => {
    await db()
    // mongoose only auto-builds indexes once per model per process; since
    // beforeEach drops the whole database (collections + indexes) between
    // tests, Credential.init() alone would be a no-op here because mongoose
    // still thinks indexes are built. syncIndexes() forces a real rebuild.
    await Credential.syncIndexes()
    const results = await Promise.allSettled([
      Credential.create({ credId: 'a', publicKey: 'x', counter: 0 }),
      Credential.create({ credId: 'b', publicKey: 'y', counter: 0 }),
    ])
    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected = results.filter(r => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect((rejected[0] as PromiseRejectedResult).reason.code).toBe(11000)
  })
})
