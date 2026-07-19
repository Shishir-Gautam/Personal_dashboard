import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Tree, TreeNode, Intent } from '@/lib/models'
import { POST } from './route'

const jsonReq = (url: string, body: unknown) =>
  new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })

const rawReq = (url: string, rawBody: string) =>
  new NextRequest(url, {
    method: 'POST',
    body: rawBody,
    headers: { 'content-type': 'application/json' },
  })

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })

beforeEach(async () => {
  await db()
  await Tree.create({ slug: 'xnock', title: 'Xnock', kind: 'project' })
})

describe('POST /api/trees/[slug]/intents', () => {
  it('creates a pending intent', async () => {
    const tree = await Tree.findOne({ slug: 'xnock' })
    const node = await TreeNode.create({ treeId: tree!._id, title: 'Rendering' })
    const res = await POST(
      jsonReq('http://x/api/trees/xnock/intents', { directive: 'focus rendering next', nodeId: String(node._id) }),
      params('xnock'),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeTruthy()
    const doc = await Intent.findById(body.id)
    expect(doc).toBeTruthy()
    expect(doc!.status).toBe('pending')
    expect(String(doc!.treeId)).toBe(String(tree!._id))
    expect(String(doc!.nodeId)).toBe(String(node._id))
    expect(doc!.directive).toBe('focus rendering next')
  })

  it('404s for unknown slug', async () => {
    const res = await POST(
      jsonReq('http://x/api/trees/nope/intents', { directive: 'x' }),
      params('nope'),
    )
    expect(res.status).toBe(404)
  })

  it('400s on invalid nodeId string', async () => {
    const res = await POST(
      jsonReq('http://x/api/trees/xnock/intents', { directive: 'x', nodeId: 'not-an-objectid' }),
      params('xnock'),
    )
    expect(res.status).toBe(400)
  })

  it('400s on malformed JSON body', async () => {
    const res = await POST(
      rawReq('http://x/api/trees/xnock/intents', '{not json'),
      params('xnock'),
    )
    expect(res.status).toBe(400)
  })

  it('400s on empty directive', async () => {
    const res = await POST(
      jsonReq('http://x/api/trees/xnock/intents', { directive: '' }),
      params('xnock'),
    )
    expect(res.status).toBe(400)
  })
})
