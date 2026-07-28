import { describe, it, expect } from 'vitest'

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
