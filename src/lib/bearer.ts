export function checkBearer(req: Request): boolean {
  return req.headers.get('authorization') === `Bearer ${process.env.DASHBOARD_TOKEN}`
}
