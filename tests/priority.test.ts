import { describe, it, expect } from 'vitest'

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
