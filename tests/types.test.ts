import { describe, it, expect } from 'vitest'

describe('types', () => {
  it('CollectedItem can be constructed', () => {
    const item = {
      id: 'test-1',
      source: 'linear' as const,
      type: 'task' as const,
      title: 'Test',
      url: null,
      status: null,
      timestamp: new Date(),
      description: null,
      metadata: null
    }
    expect(item.source).toBe('linear')
    expect(item.type).toBe('task')
  })
})
