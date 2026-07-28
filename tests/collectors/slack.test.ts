import { describe, it, expect, vi } from 'vitest'

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    users: {
      conversations: vi.fn().mockResolvedValue({
        channels: [{ id: 'C123' }]
      })
    },
    conversations: {
      history: vi.fn().mockResolvedValue({
        messages: [
          { ts: '1722000000.000001', text: 'Hey <@U123> check this out', user: 'U456' },
          { ts: '1722000000.000002', text: 'Just a regular message', user: 'U789' }
        ]
      })
    }
  }))
}))

import { SlackCollector } from '../../src/collectors/slack.js'

describe('SlackCollector', () => {
  it('returns messages where user is mentioned', async () => {
    const collector = new SlackCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { slack: { token: 'xoxp-test' }, user: { slack: 'U123' } }
    )
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('slack_message')
  })
})
