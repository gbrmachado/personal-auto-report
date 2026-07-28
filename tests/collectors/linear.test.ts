import { describe, it, expect, vi } from 'vitest'

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: Promise.resolve({ id: 'user-1' }),
    issues: vi.fn().mockResolvedValue({
      nodes: [
        {
          id: 'issue-1',
          title: 'Test issue',
          url: 'https://linear.app/team/issue/TEST-1',
          updatedAt: '2026-07-27T10:00:00.000Z',
          description: 'A test issue',
          state: { name: 'In Progress' },
          priority: 2,
          team: { name: 'Engineering' },
          identifier: 'TEST-1'
        }
      ]
    })
  }))
}))

import { LinearCollector } from '../../src/collectors/linear.js'

describe('LinearCollector', () => {
  it('returns collected items', async () => {
    const collector = new LinearCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Test issue')
    expect(items[0].source).toBe('linear')
  })
})
