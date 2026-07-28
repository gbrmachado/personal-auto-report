import { describe, it, expect, vi } from 'vitest'
import type { Collector } from '../src/collector.js'
import type { Config } from '../src/config.js'

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
    const { mockClose } = vi.hoisted(() => ({
      mockClose: vi.fn()
    }))

    vi.mock('../src/config.js', () => ({
      loadConfig: () => ({
        linear: { apiKey: 'test' },
        github: { token: 'test' },
        slack: { token: 'test' },
        user: { linear: 'me', github: 'me', slack: 'me' },
        ai: { provider: 'openai', apiKey: 'test', model: 'gpt-4o-mini' },
        db: { path: ':memory:' }
      }),
      getConfigDir: () => '/tmp'
    }))

    vi.mock('../src/db.js', () => ({
      getDb: () => ({ close: mockClose, pragma: vi.fn(), exec: vi.fn() }),
      insertCollections: vi.fn(),
      insertReview: vi.fn()
    }))

    vi.mock('../src/collectors/linear.js', () => ({
      LinearCollector: vi.fn().mockImplementation(() => ({
        name: 'linear',
        collect: vi.fn().mockResolvedValue([])
      }))
    }))
    vi.mock('../src/collectors/github.js', () => ({
      GitHubCollector: vi.fn().mockImplementation(() => ({
        name: 'github',
        collect: vi.fn().mockResolvedValue([])
      }))
    }))
    vi.mock('../src/collectors/slack.js', () => ({
      SlackCollector: vi.fn().mockImplementation(() => ({
        name: 'slack',
        collect: vi.fn().mockResolvedValue([{
          id: 'sl-test',
          source: 'slack',
          type: 'slack_message',
          title: 'test message',
          url: null,
          status: null,
          timestamp: new Date('2026-07-27T10:00:00Z'),
          description: null,
          metadata: null
        }])
      }))
    }))

    vi.mock('../src/summarizer.js', () => ({
      generateSummary: vi.fn().mockRejectedValue(new Error('API quota exceeded'))
    }))

    vi.mock('../src/aggregator.js', () => ({
      aggregate: vi.fn((items) => items)
    }))

    vi.mock('../src/renderer.js', () => ({
      renderReview: vi.fn(() => '# Raw Review\n\nNo AI today')
    }))

    const { generateReview } = await import('../src/review.js')

    const result = await generateReview('daily', true)

    expect(result).toContain('# Raw Review')
    expect(result).not.toContain('## AI Summary')
    expect(mockClose).toHaveBeenCalled()
  })
})
