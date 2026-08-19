import { describe, it, expect, vi } from 'vitest'

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: Promise.resolve({ id: 'user-1' }),
    issues: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'i1', title: 'Fix bug', url: 'https://linear.app/t/FIX-1',
          updatedAt: '2026-07-20T10:00:00.000Z', state: { name: 'In Progress' },
          priority: 2, team: null, identifier: 'FIX-1', description: null,
          dueDate: '2026-08-21', project: Promise.resolve({ name: 'Checkout' }),
          cycle: Promise.resolve({ number: 42, name: 'Cycle 42' }),
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

import { LinearClient } from '@linear/sdk'
import { PriorityEngine, renderPriorities, PriorityResult } from '../src/priority.js'

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
    expect(result.linear[0].metadata).toEqual({
      identifier: 'FIX-1', priority: 2, dueDate: '2026-08-21',
      project: 'Checkout', cycle: 'Cycle 42'
    })
  })

  it('preserves GitHub last-update evidence for focus aging', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'))
    mockRequest.mockReset()
    mockRequest
      .mockResolvedValueOnce({ data: { items: [{
        id: 10, title: 'My stale PR', html_url: 'https://github.com/o/r/pull/10',
        state: 'open', created_at: '2026-07-01T12:00:00.000Z',
        updated_at: '2026-08-10T12:00:00.000Z', user: { login: 'me' }
      }] } })
      .mockResolvedValueOnce({ data: { items: [{
        id: 11, title: 'Review request', html_url: 'https://github.com/o/r/pull/11',
        state: 'open', created_at: '2026-07-02T12:00:00.000Z',
        updated_at: '2026-08-15T12:00:00.000Z', user: { login: 'teammate' }
      }] } })

    try {
      const engine = new PriorityEngine()
      const collected = await engine.collect({
        linear: { apiKey: 'l' }, github: { token: 't' }, slack: { token: 't' },
        user: { linear: 'm@x.com', github: 'me', slack: 'U1' },
        ai: { provider: 'openai', apiKey: 'a', model: 'm' }, db: { path: ':memory:' },
        priorities: {
          linear: { statuses: ['In Progress'] },
          github: {
            created: { minAgeDays: 14, updatedAfterDays: 7 },
            pendingReview: { minAgeDays: 7, updatedAfterDays: 3 }
          }
        }
      } as any)

      expect(collected.staleCreated[0].metadata).toMatchObject({
        updatedAt: '2026-08-10T12:00:00.000Z'
      })
      expect(collected.pendingReview[0].metadata).toMatchObject({
        author: 'teammate', updatedAt: '2026-08-15T12:00:00.000Z'
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps optional Linear relationship failures from aborting collection', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [{
          id: 'i2', identifier: 'FIX-2', title: 'Keep collecting',
          url: 'https://linear.app/t/FIX-2', updatedAt: '2026-08-20T10:00:00.000Z',
          state: Promise.resolve({ name: 'In Progress' }), priority: 2, dueDate: null,
          project: Promise.reject(new Error('project unavailable')),
          cycle: Promise.reject(new Error('cycle unavailable'))
        }]
      })
    }) as any)
    mockRequest.mockReset()
    mockRequest.mockResolvedValue({ data: { items: [] } })

    const collected = await new PriorityEngine().collect({
      linear: { apiKey: 'l' }, github: { token: 't' }, slack: { token: 't' },
      user: { linear: 'm@x.com', github: 'me', slack: 'U1' },
      ai: { provider: 'openai', apiKey: 'a', model: 'm' }, db: { path: ':memory:' }
    } as any)

    expect(collected.linear).toHaveLength(1)
    expect(collected.linear[0].metadata).toMatchObject({ project: null, cycle: null })
  })

  it('keeps a single failed state lookup from aborting the whole Linear collection', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'i3', identifier: 'FIX-3', title: 'State lookup fails',
            url: 'https://linear.app/t/FIX-3', updatedAt: '2026-08-20T10:00:00.000Z',
            state: Promise.reject(new Error('state unavailable')), priority: 2, dueDate: null,
            project: Promise.resolve(null), cycle: Promise.resolve(null)
          },
          {
            id: 'i4', identifier: 'FIX-4', title: 'State lookup succeeds',
            url: 'https://linear.app/t/FIX-4', updatedAt: '2026-08-20T11:00:00.000Z',
            state: Promise.resolve({ name: 'In Progress' }), priority: 2, dueDate: null,
            project: Promise.resolve(null), cycle: Promise.resolve(null)
          }
        ]
      })
    }) as any)
    mockRequest.mockReset()
    mockRequest.mockResolvedValue({ data: { items: [] } })

    const collected = await new PriorityEngine().collect({
      linear: { apiKey: 'l' }, github: { token: 't' }, slack: { token: 't' },
      user: { linear: 'm@x.com', github: 'me', slack: 'U1' },
      ai: { provider: 'openai', apiKey: 'a', model: 'm' }, db: { path: ':memory:' }
    } as any)

    expect(collected.linear).toHaveLength(1)
    expect(collected.linear[0].title).toBe('State lookup succeeds')
  })

  it('labels a zero-indexed cycle instead of dropping it as falsy', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [{
          id: 'i5', identifier: 'FIX-5', title: 'Cycle zero',
          url: 'https://linear.app/t/FIX-5', updatedAt: '2026-08-20T10:00:00.000Z',
          state: Promise.resolve({ name: 'In Progress' }), priority: 2, dueDate: null,
          project: Promise.resolve(null), cycle: Promise.resolve({ number: 0, name: null })
        }]
      })
    }) as any)
    mockRequest.mockReset()
    mockRequest.mockResolvedValue({ data: { items: [] } })

    const collected = await new PriorityEngine().collect({
      linear: { apiKey: 'l' }, github: { token: 't' }, slack: { token: 't' },
      user: { linear: 'm@x.com', github: 'me', slack: 'U1' },
      ai: { provider: 'openai', apiKey: 'a', model: 'm' }, db: { path: ':memory:' }
    } as any)

    expect(collected.linear[0].metadata).toMatchObject({ cycle: 'Cycle 0' })
  })
})

describe('renderPriorities', () => {
  it('shows all caught up when empty', () => {
    const result: PriorityResult = { linear: [], staleCreated: [], pendingReview: [] }
    const md = renderPriorities(result)
    expect(md).toContain('Nothing to do')
  })

  it('renders linear tasks', () => {
    const result: PriorityResult = {
      linear: [{ id: '1', source: 'linear', type: 'task', title: 'Fix bug',
        url: 'https://linear.app/t/FIX-1', status: 'In Progress',
        timestamp: new Date(Date.now() - 86400000), description: null, metadata: null }],
      staleCreated: [], pendingReview: []
    }
    const md = renderPriorities(result)
    expect(md).toContain('Fix bug')
    expect(md).toContain('1d ago')
  })
})
