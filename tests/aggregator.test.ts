import { describe, it, expect } from 'vitest'
import { aggregate, groupBySource, groupByType } from '../src/aggregator.js'
import type { CollectedItem } from '../src/types.js'

describe('aggregator', () => {
  it('sorts items chronologically', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Second', url: null, status: null, timestamp: new Date('2026-07-27T11:00:00Z'), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'First', url: null, status: null, timestamp: new Date('2026-07-27T10:00:00Z'), description: null, metadata: null }
    ]
    const sorted = aggregate(items)
    expect(sorted[0].title).toBe('First')
    expect(sorted[1].title).toBe('Second')
  })

  it('groups by source', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'A', url: null, status: null, timestamp: new Date(), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'B', url: null, status: null, timestamp: new Date(), description: null, metadata: null }
    ]
    const groups = groupBySource(items)
    expect(groups.linear).toHaveLength(1)
    expect(groups.github).toHaveLength(1)
  })

  it('groups by type', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'A', url: null, status: null, timestamp: new Date(), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'B', url: null, status: null, timestamp: new Date(), description: null, metadata: null },
      { id: '3', source: 'slack', type: 'task', title: 'C', url: null, status: null, timestamp: new Date(), description: null, metadata: null }
    ]
    const groups = groupByType(items)
    expect(groups.task).toHaveLength(2)
    expect(groups.pr_created).toHaveLength(1)
  })
})
