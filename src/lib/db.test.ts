import { describe, it, expect } from 'vitest'
import { db } from './db'

describe('db', () => {
  it('connects and reuses the cached connection', async () => {
    const a = await db()
    const b = await db()
    expect(a).toBe(b)
    expect(a.connection.readyState).toBe(1)
  })
})
