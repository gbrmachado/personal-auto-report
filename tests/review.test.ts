import { describe, it, expect, vi } from 'vitest'
import type { Collector } from '../src/collector.js'
import type { Config } from '../src/config.js'

const { mockRenderReview, mockDbClose, mockLinearCollect, mockGithubCollect, mockSlackCollect, mockLoadConfig } = vi.hoisted(() => ({
  mockRenderReview: vi.fn(() => '# Review'),
  mockDbClose: vi.fn(),
  mockLinearCollect: vi.fn(),
  mockGithubCollect: vi.fn(),
  mockSlackCollect: vi.fn(),
  mockLoadConfig: vi.fn(() => ({
    linear: { apiKey: 'test' },
    github: { token: 'test' },
    slack: { token: 'test' },
    user: { linear: 'me', github: 'me', slack: 'me' },
    ai: { provider: 'openai', apiKey: 'test', model: 'gpt-4o-mini' },
    db: { path: ':memory:' }
  }))
}))

vi.mock('../src/renderer.js', () => ({ renderReview: mockRenderReview }))

vi.mock('../src/config.js', () => ({
  loadConfig: mockLoadConfig,
  getConfigDir: () => '/tmp'
}))

vi.mock('../src/db.js', () => ({
  getDb: () => ({ close: mockDbClose, pragma: vi.fn(), exec: vi.fn() }),
  insertCollections: vi.fn(),
  insertReview: vi.fn()
}))

vi.mock('../src/aggregator.js', () => ({
  aggregate: vi.fn((items: any) => items)
}))

vi.mock('../src/summarizer.js', () => ({
  generateSummary: vi.fn().mockRejectedValue(new Error('API quota exceeded'))
}))

vi.mock('../src/collectors/linear.js', () => ({
  LinearCollector: vi.fn(() => ({ name: 'linear', collect: mockLinearCollect }))
}))

vi.mock('../src/collectors/github.js', () => ({
  GitHubCollector: vi.fn(() => ({ name: 'github', collect: mockGithubCollect }))
}))

vi.mock('../src/collectors/slack.js', () => ({
  SlackCollector: vi.fn(() => ({ name: 'slack', collect: mockSlackCollect }))
}))

describe('date range helpers', () => {
  it('daily range starts at midnight today', async () => {
    const { getDateRange } = await import('../src/review.js')
    const range = getDateRange('daily')
    const now = new Date()
    expect(range.start.getHours()).toBe(0)
    expect(range.start.getMinutes()).toBe(0)
    expect(range.start.getSeconds()).toBe(0)
    expect(range.start.getDate()).toBe(now.getDate())
  })

  it('weekly range starts on Monday', async () => {
    const { getDateRange } = await import('../src/review.js')
    const range = getDateRange('weekly')
    expect(range.start.getDay()).toBe(1)
  })

  it('accepts custom from and to dates', async () => {
    const { getDateRange } = await import('../src/review.js')
    const range = getDateRange('daily', '2026-07-26', '2026-07-27')
    expect(range.start.getFullYear()).toBe(2026)
    expect(range.start.getMonth()).toBe(6) // July
    expect(range.start.getDate()).toBe(26)
    expect(range.start.getHours()).toBe(0)
    expect(range.end.getFullYear()).toBe(2026)
    expect(range.end.getMonth()).toBe(6)
    expect(range.end.getDate()).toBe(27)
    expect(range.end.getHours()).toBe(23)
  })

  it('accepts datetime strings for custom range', async () => {
    const { getDateRange, parseDateInput } = await import('../src/review.js')
    const parsed = parseDateInput('2026-07-27T14:30:00', 'start')
    expect(parsed.getHours()).toBe(14)
    expect(parsed.getMinutes()).toBe(30)

    const range = getDateRange('daily', '2026-07-27T14:00:00', '2026-07-27T16:00:00')
    expect(range.start.getHours()).toBe(14)
    expect(range.end.getHours()).toBe(16)
  })

  it('caps range to 7 days', async () => {
    const { getDateRange } = await import('../src/review.js')
    const range = getDateRange('daily', '2026-07-01', '2026-07-28')
    expect(range.start.getFullYear()).toBe(2026)
    expect(range.start.getMonth()).toBe(6)
    expect(range.start.getDate()).toBe(21) // 7 days before end
    expect(range.end.getDate()).toBe(28)
  })

  it('defaults to now when no toDate is given', async () => {
    const { getDateRange } = await import('../src/review.js')
    const range = getDateRange('daily', '2026-07-27')
    const now = new Date()
    expect(range.end.getDate()).toBe(now.getDate())
    expect(range.end.getFullYear()).toBe(now.getFullYear())
  })
})

describe('fresh collection', () => {
  it('runs collectors on every invocation and reports failures', async () => {
    const collect = vi.fn().mockResolvedValue([])
    const failingCollect = vi.fn().mockRejectedValue(new Error('unavailable'))
    const collectors: Collector[] = [
      { name: 'working', collect },
      { name: 'failing', collect: failingCollect }
    ]
    const config = {} as Config
    const range = { start: new Date('2026-07-27'), end: new Date('2026-07-28') }
    const { collectFresh } = await import('../src/review.js')

    const first = await collectFresh(collectors, range, config)
    const second = await collectFresh(collectors, range, config)

    expect(collect).toHaveBeenCalledTimes(2)
    expect(failingCollect).toHaveBeenCalledTimes(2)
    expect(first.warnings).toEqual(['failing collector failed: unavailable'])
    expect(second.warnings).toEqual(['failing collector failed: unavailable'])
  })
})

describe('AI failure resilience', () => {
  it('returns raw review when AI summary throws', async () => {
    mockRenderReview.mockReturnValue('# Raw Review\n\nNo AI today')
    mockLinearCollect.mockResolvedValue([])
    mockGithubCollect.mockResolvedValue([])
    mockSlackCollect.mockResolvedValue([])

    const { generateReview } = await import('../src/review.js')

    const result = await generateReview('daily', true)

    expect(result).toContain('# Raw Review')
    expect(result).not.toContain('## AI Summary')
    expect(mockDbClose).toHaveBeenCalled()
  })
})

describe('cross-reference integration', () => {
  it('computes cross-references and passes them to renderer', async () => {
    mockRenderReview.mockClear()
    mockRenderReview.mockReturnValue('# Review')
    mockLinearCollect.mockResolvedValue([{
      id: 'linear-1', source: 'linear', type: 'task',
      title: 'Test', url: null, status: 'Done',
      timestamp: new Date('2026-07-29'), description: null,
      metadata: { identifier: 'ENG-1' }
    }])
    mockGithubCollect.mockResolvedValue([{
      id: 'gh-1', source: 'github', type: 'pr_created',
      title: 'ENG-1 fix', url: null, status: 'open',
      timestamp: new Date('2026-07-29'), description: null,
      metadata: { repo: 'org/repo' }
    }])
    mockSlackCollect.mockResolvedValue([])

    const { generateReview } = await import('../src/review.js')
    await generateReview('daily', false)

    const calls = mockRenderReview.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const args = calls[0] as unknown as unknown[]
    expect(args.length).toBe(7)
    const crossRefsArg = args[5] as Array<{ relationType: string }>
    expect(crossRefsArg).toHaveLength(1)
    expect(crossRefsArg[0].relationType).toBe('implements')
    expect(args[6]).toBe('none')
  })

  it('passes groupBy from config to renderReview', async () => {
    mockRenderReview.mockClear()
    mockRenderReview.mockReturnValue('# Review')
    mockLinearCollect.mockResolvedValue([])
    mockGithubCollect.mockResolvedValue([])
    mockSlackCollect.mockResolvedValue([])

    mockLoadConfig.mockReturnValueOnce({
      linear: { apiKey: 'test' },
      github: { token: 'test' },
      slack: { token: 'test' },
      user: { linear: 'me', github: 'me', slack: 'me' },
      ai: { provider: 'openai', apiKey: 'test', model: 'gpt-4o-mini' },
      db: { path: ':memory:' },
      display: { groupBy: 'team' as const }
    } as Config)

    const { generateReview } = await import('../src/review.js')
    await generateReview('daily', false)

    const args = mockRenderReview.mock.calls[0] as unknown as unknown[]
    expect(args[6]).toBe('team')
  })

  it('includes slack cross-references in integration', async () => {
    mockRenderReview.mockClear()
    mockRenderReview.mockReturnValue('# Review')
    mockLinearCollect.mockResolvedValue([{
      id: 'linear-1', source: 'linear', type: 'task',
      title: 'Test', url: null, status: 'Done',
      timestamp: new Date('2026-07-29'), description: null,
      metadata: { identifier: 'ENG-1' }
    }])
    mockGithubCollect.mockResolvedValue([])
    mockSlackCollect.mockResolvedValue([{
      id: 'slack-1', source: 'slack', type: 'slack_message',
      title: 'ENG-1 is deployed', url: null, status: null,
      timestamp: new Date('2026-07-29'), description: null,
      metadata: { channel: 'eng' }
    }])

    const { generateReview } = await import('../src/review.js')
    await generateReview('daily', false)

    const calls = mockRenderReview.mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const args = calls[0] as unknown as unknown[]
    expect(args.length).toBe(7)
    const crossRefsArg = args[5] as Array<{ relationType: string }>
    expect(crossRefsArg).toHaveLength(1)
    expect(crossRefsArg[0].relationType).toBe('mentioned_in')
  })
})
