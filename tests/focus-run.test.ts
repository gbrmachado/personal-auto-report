import { describe, expect, it, vi } from 'vitest'
import { runFocus } from '../src/focus/run.js'
import type { PriorityResult } from '../src/priority.js'
import type { OutputAdapter } from '../src/outputs/types.js'

const result: PriorityResult = {
  linear: [{
    id: 'ENG-1', source: 'linear', type: 'task', title: 'Finish work',
    url: 'https://linear.app/ENG-1', status: 'In Progress',
    timestamp: new Date('2026-08-19T12:00:00.000Z'), description: null,
    metadata: { priority: 2 }
  }],
  staleCreated: [],
  pendingReview: []
}

describe('runFocus', () => {
  it('keeps collection, focus policy, and delivery behind independent contracts', async () => {
    const collector = { collect: vi.fn().mockResolvedValue(result) }
    const deliver = vi.fn().mockImplementation(async report => ({
      adapter: 'test', eventId: report.id, deliveredAt: '2026-08-20T12:00:01.000Z'
    }))
    const output: OutputAdapter = { name: 'test', deliver }
    const config = { marker: 'config' } as any

    const receipt = await runFocus(config, output, {
      now: new Date('2026-08-20T12:00:00.000Z'), timezone: 'UTC'
    }, collector)

    expect(collector.collect).toHaveBeenCalledWith(config)
    expect(deliver).toHaveBeenCalledOnce()
    expect(deliver.mock.calls[0][0].primaryFocus.map((item: any) => item.id)).toEqual(['ENG-1'])
    expect(receipt).toMatchObject({ adapter: 'test', eventId: 'focus-2026-08-20' })
  })

  it('validates focus options before collecting external data', async () => {
    const collector = { collect: vi.fn().mockResolvedValue(result) }
    const output: OutputAdapter = {
      name: 'test',
      deliver: vi.fn().mockResolvedValue({ adapter: 'test', eventId: 'x', deliveredAt: 'x' })
    }

    await expect(runFocus({} as any, output, {
      timezone: 'Invalid/Timezone'
    }, collector)).rejects.toThrow('Invalid timezone')

    expect(collector.collect).not.toHaveBeenCalled()
  })

  it('rejects an invalid reference time before collecting external data', async () => {
    const collector = { collect: vi.fn().mockResolvedValue(result) }
    const output: OutputAdapter = {
      name: 'test',
      deliver: vi.fn().mockResolvedValue({ adapter: 'test', eventId: 'x', deliveredAt: 'x' })
    }

    await expect(runFocus({} as any, output, {
      now: new Date('invalid')
    }, collector)).rejects.toThrow('Invalid now')

    expect(collector.collect).not.toHaveBeenCalled()
  })
})
