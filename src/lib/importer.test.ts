import { describe, it, expect } from 'vitest'
import { db } from './db'
import { TreeNode } from './models'
import { importTree, parseOutline } from './importer'

describe('parseOutline', () => {
  it('parses titles and depths', () => {
    expect(parseOutline('- A\n  - B\n    - C\n- D')).toEqual([
      { title: 'A', depth: 0 }, { title: 'B', depth: 1 }, { title: 'C', depth: 2 }, { title: 'D', depth: 0 },
    ])
  })
})

describe('importTree', () => {
  it('creates Setup root done, wires prereqs, computes statuses', async () => {
    await db()
    await importTree({ slug: 't', title: 'T', kind: 'life', outline: '- A\n  - B\n- D' })
    const nodes = await TreeNode.find().sort('createdAt')
    const byTitle = Object.fromEntries(nodes.map(x => [x.title, x]))
    expect(byTitle['Setup'].status).toBe('done')
    expect(byTitle['A'].status).toBe('available')
    expect(byTitle['A'].prereqs.map(String)).toEqual([String(byTitle['Setup']._id)])
    expect(byTitle['B'].status).toBe('locked')
    expect(byTitle['B'].prereqs.map(String)).toEqual([String(byTitle['A']._id)])
    expect(byTitle['D'].status).toBe('available')
  })
})
