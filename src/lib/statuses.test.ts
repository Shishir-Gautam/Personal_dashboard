import { describe, it, expect } from 'vitest'
import { computeStatuses } from './statuses'

const n = (id: string, over: Partial<{ status: string; progress: number; prereqs: string[] }> = {}) =>
  ({ id, status: 'locked', progress: 0, prereqs: [], ...over })

describe('computeStatuses', () => {
  it('root with no prereqs is available', () => {
    expect(computeStatuses([n('a')]).get('a')).toBe('available')
  })
  it('locked while any prereq not done, available when all done', () => {
    const st = computeStatuses([n('a', { status: 'done' }), n('b'), n('c', { prereqs: ['a', 'b'] })])
    expect(st.get('c')).toBe('locked')
    const st2 = computeStatuses([n('a', { status: 'done' }), n('b', { progress: 100 }), n('c', { prereqs: ['a', 'b'] })])
    expect(st2.get('c')).toBe('available')
  })
  it('progress > 0 means in_progress; >= 100 means done', () => {
    const st = computeStatuses([n('a', { progress: 40 }), n('b', { progress: 100 })])
    expect(st.get('a')).toBe('in_progress')
    expect(st.get('b')).toBe('done')
  })
})
