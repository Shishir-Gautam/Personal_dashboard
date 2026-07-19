import { describe, it, expect, afterEach } from 'vitest'
import { checkBearer } from './bearer'

describe('checkBearer', () => {
  const originalToken = process.env.DASHBOARD_TOKEN

  afterEach(() => {
    if (originalToken !== undefined) {
      process.env.DASHBOARD_TOKEN = originalToken
    } else {
      delete process.env.DASHBOARD_TOKEN
    }
  })

  it('returns true with valid token', () => {
    process.env.DASHBOARD_TOKEN = 'test-secret-token'
    const req = {
      headers: new Map([['authorization', 'Bearer test-secret-token']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(true)
  })

  it('returns false with wrong token', () => {
    process.env.DASHBOARD_TOKEN = 'test-secret-token'
    const req = {
      headers: new Map([['authorization', 'Bearer wrong-token']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })

  it('returns false when authorization header is missing', () => {
    process.env.DASHBOARD_TOKEN = 'test-secret-token'
    const req = {
      headers: new Map([])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })

  it('returns false when DASHBOARD_TOKEN is not set', () => {
    delete process.env.DASHBOARD_TOKEN
    const req = {
      headers: new Map([['authorization', 'Bearer test-secret-token']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })

  it('returns false when DASHBOARD_TOKEN is empty string', () => {
    process.env.DASHBOARD_TOKEN = ''
    const req = {
      headers: new Map([['authorization', 'Bearer ']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })

  it('returns false when header does not start with Bearer', () => {
    process.env.DASHBOARD_TOKEN = 'test-secret-token'
    const req = {
      headers: new Map([['authorization', 'Basic dGVzdDpwYXNz']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })

  it('returns false with wrong-length token (timing-safe comparison)', () => {
    process.env.DASHBOARD_TOKEN = 'test-secret-token'
    const req = {
      headers: new Map([['authorization', 'Bearer test-secret']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })

  it('returns false with case-sensitive token comparison', () => {
    process.env.DASHBOARD_TOKEN = 'TEST-SECRET-TOKEN'
    const req = {
      headers: new Map([['authorization', 'Bearer test-secret-token']])
    } as unknown as Request
    expect(checkBearer(req)).toBe(false)
  })
})
