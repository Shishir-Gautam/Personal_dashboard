import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'
import { signSession, SESSION_COOKIE } from '@/lib/session'

describe('middleware', () => {
  it('passes public path /login untouched without a session', async () => {
    const req = new NextRequest('http://localhost:3000/login')
    const res = await middleware(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('redirects unauthenticated / to /login', async () => {
    const req = new NextRequest('http://localhost:3000/')
    const res = await middleware(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
  })

  it('returns 401 JSON for unauthenticated /api/trees', async () => {
    const req = new NextRequest('http://localhost:3000/api/trees')
    const res = await middleware(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'unauthorized' })
  })

  it('passes authenticated / and refreshes the session cookie', async () => {
    const token = await signSession()
    const req = new NextRequest('http://localhost:3000/', {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    })
    const res = await middleware(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    const setCookie = res.cookies.get(SESSION_COOKIE)
    expect(setCookie).toBeDefined()
    expect(setCookie!.value).not.toBe('')
  })

  it('passes /api/updates and /api/intents without a session', async () => {
    const updates = await middleware(new NextRequest('http://localhost:3000/api/updates'))
    expect(updates.status).toBe(200)
    const intents = await middleware(new NextRequest('http://localhost:3000/api/intents'))
    expect(intents.status).toBe(200)
  })

  it('redirects /loginAttempts without a session (regression: /login prefix must not overmatch)', async () => {
    const req = new NextRequest('http://localhost:3000/loginAttempts')
    const res = await middleware(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login')
  })
})
