import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'pd_session'
export const SESSION_TTL_S = 30 * 60 // 30-minute sliding inactivity window

const secret = () => {
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(process.env.SESSION_SECRET)
}

export async function signSession(): Promise<string> {
  return new SignJWT({ u: 'owner' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(secret())
}

export async function verifySession(token: string): Promise<boolean> {
  try { await jwtVerify(token, secret(), { algorithms: ['HS256'] }); return true } catch { return false }
}

export const sessionCookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: SESSION_TTL_S,
  path: '/',
}
