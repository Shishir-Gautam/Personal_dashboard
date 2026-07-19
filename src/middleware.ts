import { NextRequest, NextResponse } from 'next/server'
import { verifySession, signSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session'

const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/api\/updates$/, /^\/api\/intents$/]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some(r => r.test(pathname))) return NextResponse.next()
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token && (await verifySession(token))) {
    const res = NextResponse.next()
    res.cookies.set(SESSION_COOKIE, await signSession(), sessionCookieOptions)
    return res
  }
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.redirect(new URL('/login', req.url))
}

export const config = { matcher: ['/((?!_next|favicon\\.ico).*)'] }
