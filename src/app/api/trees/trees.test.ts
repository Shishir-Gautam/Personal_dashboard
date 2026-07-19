import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Tree } from '@/lib/models'
import { POST } from './route'

describe('POST /api/trees', () => {
  beforeEach(async () => {
    await db()
    await Tree.deleteMany({})
  })

  it('returns 400 on malformed JSON', async () => {
    const req = new NextRequest('http://x/api/trees', {
      method: 'POST',
      body: '{nope',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('bad payload')
  })

  it('returns 409 on duplicate slug', async () => {
    // Create initial tree
    const req1 = new NextRequest('http://x/api/trees', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'test-tree',
        title: 'Test',
        kind: 'project',
        outline: '- A',
      }),
    })
    await POST(req1)

    // Attempt to create duplicate
    const req2 = new NextRequest('http://x/api/trees', {
      method: 'POST',
      body: JSON.stringify({
        slug: 'test-tree',
        title: 'Duplicate',
        kind: 'project',
        outline: '- B',
      }),
    })
    const res = await POST(req2)
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('slug taken')
  })
})
