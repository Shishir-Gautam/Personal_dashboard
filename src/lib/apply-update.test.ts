import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './db'
import { Tree, TreeNode, Update, Intent } from './models'
import { applyUpdate } from './apply-update'

let treeId: string, aId: string, bId: string

beforeEach(async () => {
  await db()
  const tree = await Tree.create({ slug: 'xnock', title: 'Xnock', kind: 'project' })
  treeId = String(tree._id)
  const a = await TreeNode.create({ treeId, title: 'Core engine', status: 'in_progress', progress: 50 })
  aId = String(a._id)
  const b = await TreeNode.create({ treeId, title: 'Rendering', prereqs: [aId] })
  bId = String(b._id)
})

describe('applyUpdate', () => {
  it('applies delta, appends update, completes at 100, unlocks dependents', async () => {
    const r = await applyUpdate({ tree: 'xnock', updates: [{ node: 'core engine', delta: 50, note: 'engine finished' }] })
    expect(r.applied).toEqual(['Core engine'])
    const a = await TreeNode.findById(aId)
    expect(a!.status).toBe('done')
    const b = await TreeNode.findById(bId)
    expect(b!.status).toBe('available')
    expect(await Update.countDocuments()).toBe(1)
  })
  it('routes unknown node titles to the proposed inbox', async () => {
    const r = await applyUpdate({ tree: 'xnock', updates: [{ node: 'Networking', delta: 10, note: 'started sockets' }] })
    expect(r.unknown).toEqual(['Networking'])
    const t = await Tree.findOne({ slug: 'xnock' })
    expect(t!.proposed[0].title).toBe('Networking')
    expect(await TreeNode.countDocuments()).toBe(2) // never auto-added
  })
  it('marks intents done', async () => {
    const i = await Intent.create({ treeId, directive: 'focus rendering', status: 'delivered' })
    await applyUpdate({ tree: 'xnock', updates: [], intentsDone: [String(i._id)] })
    expect((await Intent.findById(i._id))!.status).toBe('done')
  })
  it('rejects unknown tree and bad payloads', async () => {
    await expect(applyUpdate({ tree: 'nope', updates: [] })).rejects.toThrow('unknown tree')
    await expect(applyUpdate({ updates: 'x' })).rejects.toThrow()
  })
})
