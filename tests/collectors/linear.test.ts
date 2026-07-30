import { describe, it, expect, vi } from 'vitest'

const { LinearClient } = vi.hoisted(() => ({
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
          project: Promise.resolve({ name: 'Checkout' }),
          identifier: 'TEST-1'
        }
      ]
    })
  }))
}))

vi.mock('@linear/sdk', () => ({ LinearClient }))

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
    expect(items[0].metadata?.project).toBe('Checkout')
  })

  it('handles null project metadata', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-2',
            title: 'No project issue',
            url: 'https://linear.app/team/issue/TEST-2',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Todo' },
            priority: 1,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-2'
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.project).toBeNull()
  })

  it('handles null team metadata', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-3',
            title: 'No team issue',
            url: 'https://linear.app/team/issue/TEST-3',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Todo' },
            priority: 1,
            team: Promise.resolve(null),
            project: Promise.resolve(null),
            identifier: 'TEST-3'
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.team).toBeNull()
    expect(items[0].metadata?.project).toBeNull()
  })
})
