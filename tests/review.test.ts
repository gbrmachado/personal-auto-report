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
