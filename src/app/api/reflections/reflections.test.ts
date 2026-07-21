import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Reflection } from '@/lib/models'
import { mondayOf } from '@/lib/queries'
import { POST } from './route'

describe('POST /api/reflections', () => {
  beforeEach(async () => {
    await db()
    await Reflection.deleteMany({})
  })

  it('returns 400 on malformed JSON', async () => {
    const req = new NextRequest('http://x/api/reflections', {
      method: 'POST',
      body: '{nope',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('bad payload')
  })

  it('returns 400 on empty body string', async () => {
    const req = new NextRequest('http://x/api/reflections', {
      method: 'POST',
      body: JSON.stringify({ body: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('bad payload')
  })

  it('creates reflection for current week', async () => {
    const req = new NextRequest('http://x/api/reflections', {
      method: 'POST',
      body: JSON.stringify({ body: 'My reflection' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)

    // Assert doc exists with weekStart = mondayOf()
    const doc = await Reflection.findOne({ weekStart: mondayOf() })
    expect(doc).toBeDefined()
    expect(doc!.body).toBe('My reflection')
  })

  it('updates reflection same week without duplicating', async () => {
    // First POST
    const req1 = new NextRequest('http://x/api/reflections', {
      method: 'POST',
      body: JSON.stringify({ body: 'First reflection' }),
    })
    await POST(req1)

    // Second POST same week
    const req2 = new NextRequest('http://x/api/reflections', {
      method: 'POST',
      body: JSON.stringify({ body: 'Updated reflection' }),
    })
    const res = await POST(req2)
    expect(res.status).toBe(200)

    // Count should stay 1, body updated
    const count = await Reflection.countDocuments({ weekStart: mondayOf() })
    expect(count).toBe(1)
    const doc = await Reflection.findOne({ weekStart: mondayOf() })
    expect(doc!.body).toBe('Updated reflection')
  })
})
