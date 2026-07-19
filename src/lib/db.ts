import mongoose from 'mongoose'

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }
const g = global as unknown as { _mongoose?: Cached }
const cached: Cached = g._mongoose ?? { conn: null, promise: null }
g._mongoose = cached

export async function db() {
  if (cached.conn) return cached.conn
  cached.promise ??= mongoose.connect(process.env.MONGODB_URI!, {
    dbName: process.env.MONGODB_DB || 'dashboard',
  })
  cached.conn = await cached.promise
  return cached.conn
}
