import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { beforeAll, afterAll, beforeEach } from 'vitest'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongod.getUri()
  process.env.MONGODB_DB = 'test'
  process.env.DASHBOARD_TOKEN = 'test-token'
  process.env.SESSION_SECRET = 'test-secret-test-secret-test-secret'
  process.env.RP_ID = 'localhost'
  process.env.ORIGIN = 'http://localhost:3000'
})

beforeEach(async () => {
  const { db } = await import('@/lib/db')
  const conn = await db()
  await conn.connection.db!.dropDatabase()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod?.stop()
})
