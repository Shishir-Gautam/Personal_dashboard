import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { Tree, TreeNode, Intent } from '@/lib/models'
import { GET } from './route'

const req = (url: string, token = 'test-token') =>
  new NextRequest(url, { headers: { authorization: `Bearer ${token}` } })

beforeEach(async () => {
  await db()
  const tree = await Tree.create({ slug: 'xnock', title: 'Xnock', kind: 'project' })
  const node = await TreeNode.create({ treeId: tree._id, title: 'Rendering' })
  await Intent.create({ treeId: tree._id, nodeId: node._id, directive: 'focus rendering next' })
})

describe('GET /api/intents', () => {
  it('401s without token', async () => {
    const res = await GET(req('http://x/api/intents?project=xnock', 'wrong'))
    expect(res.status).toBe(401)
  })
  it('returns pending intents with node titles and marks delivered', async () => {
    const res = await GET(req('http://x/api/intents?project=xnock'))
    const body = await res.json()
    expect(body.intents).toHaveLength(1)
    expect(body.intents[0].node).toBe('Rendering')
    expect(body.intents[0].directive).toBe('focus rendering next')
    expect((await Intent.findOne())!.status).toBe('delivered')
    const again = await (await GET(req('http://x/api/intents?project=xnock'))).json()
    expect(again.intents).toHaveLength(0)
  })
  it('delivers each pending intent exactly once under concurrent GETs', async () => {
    const [res1, res2] = await Promise.all([
      GET(req('http://x/api/intents?project=xnock')),
      GET(req('http://x/api/intents?project=xnock')),
    ])
    const [body1, body2] = await Promise.all([res1.json(), res2.json()])
    const total = body1.intents.length + body2.intents.length
    expect(total).toBe(1)
  })
})
