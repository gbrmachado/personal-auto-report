import { describe, it, expect, vi } from 'vitest'

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: Promise.resolve({ id: 'user-1' }),
    issues: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'i1', title: 'Fix bug', url: 'https://linear.app/t/FIX-1',
          updatedAt: '2026-07-20T10:00:00.000Z', state: { name: 'In Progress' },
          priority: 2, team: null, identifier: 'FIX-1', description: null,
          assignee: { id: 'user-1' } }
      ]
    })
  }))
}))

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn()
}))

vi.mock('octokit', () => ({
  Octokit: vi.fn(() => ({ request: mockRequest }))
}))

import { PriorityEngine } from '../src/priority.js'

describe('getPrioritiesConfig', () => {
  it('uses defaults when no priorities section exists', async () => {
    const { getPrioritiesConfig } = await import('../src/config.js')
    const config = { linear: { apiKey: 't' }, github: { token: 't' }, slack: { token: 't' },
      user: { linear: 'a', github: 'a', slack: 'a' },
      ai: { provider: 'openai', apiKey: 't', model: 'm' },
      db: { path: ':memory:' } } as any
    const p = getPrioritiesConfig(config)
    expect(p.linear.statuses).toContain('Todo')
    expect(p.github.created.minAgeDays).toBe(14)
  })

  it('returns configured values when present', async () => {
    const { getPrioritiesConfig } = await import('../src/config.js')
    const config = { priorities: { linear: { statuses: ['In Progress'] },
      github: { created: { minAgeDays: 7, updatedAfterDays: 3 },
        pendingReview: { minAgeDays: 3, updatedAfterDays: 1 } } } } as any
    const p = getPrioritiesConfig(config)
    expect(p.linear.statuses).toEqual(['In Progress'])
    expect(p.github.created.minAgeDays).toBe(7)
  })
})

describe('PriorityEngine', () => {
  it('returns linear tasks filtered by configured statuses', async () => {
    mockRequest.mockResolvedValue({ data: { items: [] } })
    const engine = new PriorityEngine()
    const result = await engine.collect({
      linear: { apiKey: 't' }, github: { token: 't' },
      slack: { token: 't' }, user: { linear: 'm@x.com', github: 'me', slack: 'U1' },
      ai: { provider: 'openai', apiKey: 't', model: 'm' },
      db: { path: ':memory:' },
    } as any)
    expect(result.linear).toHaveLength(1)
    expect(result.linear[0].title).toBe('Fix bug')
  })
})
