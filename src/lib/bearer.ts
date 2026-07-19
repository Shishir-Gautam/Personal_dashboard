import { timingSafeEqual } from 'crypto'

export function checkBearer(req: Request): boolean {
  const token = process.env.DASHBOARD_TOKEN
  if (!token) return false
  const header = req.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return false
  const given = Buffer.from(header.slice(7))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}
