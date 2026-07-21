export function webauthnEnv() {
  const rpID = process.env.RP_ID
  const origin = process.env.ORIGIN
  if (!rpID || !origin) throw new Error('RP_ID and ORIGIN must be set')
  return { rpID, origin }
}
