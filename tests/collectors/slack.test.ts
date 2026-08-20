import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsersConversations, mockConversationsHistory } = vi.hoisted(() => ({
  mockUsersConversations: vi.fn(),
  mockConversationsHistory: vi.fn()
}))

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    users: { conversations: mockUsersConversations },
    conversations: { history: mockConversationsHistory }
  }))
}))

import { SlackCollector } from '../../src/collectors/slack.js'

const range = {
  start: new Date('2026-07-27T00:00:00.000Z'),
  end: new Date('2026-07-28T00:00:00.000Z')
}
const config = { slack: { token: 'xoxp-test' }, user: { slack: 'U123' } }

beforeEach(() => {
  mockUsersConversations.mockReset().mockResolvedValue({
    channels: [{ id: 'C123' }],
    response_metadata: { next_cursor: '' }
  })
  mockConversationsHistory.mockReset().mockResolvedValue({
    messages: [
      { ts: '1722000000.000001', text: 'Hey <@U123> check this out', user: 'U456' },
      { ts: '1722000000.000002', text: 'Just a regular message', user: 'U789' }
    ],
    response_metadata: { next_cursor: '' }
  })
})

describe('SlackCollector', () => {
  it('returns messages where user is mentioned', async () => {
    const items = await new SlackCollector().collect(range, config)

    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('slack_message')
  })

  it('collects channels from every users.conversations page', async () => {
    mockUsersConversations
      .mockResolvedValueOnce({
        channels: [{ id: 'C-FIRST' }],
        response_metadata: { next_cursor: 'channels-page-2' }
      })
      .mockResolvedValueOnce({
        channels: [{ id: 'C-SECOND' }],
        response_metadata: { next_cursor: '' }
      })
    mockConversationsHistory.mockImplementation(({ channel }) => Promise.resolve({
      messages: [{
        ts: channel === 'C-FIRST' ? '1722000000.000001' : '1722000000.000002',
        text: `<@U123> mention in ${channel}`,
        user: 'U456'
      }],
      response_metadata: { next_cursor: '' }
    }))

    const items = await new SlackCollector().collect(range, config)

    expect(items.map(item => item.metadata?.channel)).toEqual(['C-FIRST', 'C-SECOND'])
    expect(mockUsersConversations).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: 'channels-page-2'
    }))
  })

  it('collects messages from every conversations.history page', async () => {
    mockConversationsHistory
      .mockResolvedValueOnce({
        messages: [{ ts: '1722000000.000001', text: 'first <@U123>', user: 'U456' }],
        response_metadata: { next_cursor: 'messages-page-2' }
      })
      .mockResolvedValueOnce({
        messages: [{ ts: '1722000000.000002', text: 'second <@U123>', user: 'U789' }],
        response_metadata: { next_cursor: '' }
      })

    const items = await new SlackCollector().collect(range, config)

    expect(items.map(item => item.title)).toEqual(['first <@U123>', 'second <@U123>'])
    expect(mockConversationsHistory).toHaveBeenNthCalledWith(2, expect.objectContaining({
      channel: 'C123',
      cursor: 'messages-page-2'
    }))
  })

  it('rejects a repeated users.conversations cursor', async () => {
    mockUsersConversations
      .mockResolvedValueOnce({
        channels: [{ id: 'C-FIRST' }],
        response_metadata: { next_cursor: 'repeated-cursor' }
      })
      .mockResolvedValueOnce({
        channels: [{ id: 'C-SECOND' }],
        response_metadata: { next_cursor: 'repeated-cursor' }
      })
      .mockResolvedValueOnce({
        channels: [{ id: 'C-THIRD' }],
        response_metadata: { next_cursor: '' }
      })

    await expect(new SlackCollector().collect(range, config)).rejects.toThrow(
      'Slack users.conversations returned a repeated pagination cursor'
    )
    expect(mockUsersConversations).toHaveBeenCalledTimes(2)
  })

  it('skips a channel whose conversations.history pagination detects a repeated cursor, keeping messages already collected', async () => {
    mockConversationsHistory
      .mockResolvedValueOnce({
        messages: [{ ts: '1722000000.000001', text: 'first <@U123>', user: 'U456' }],
        response_metadata: { next_cursor: 'repeated-cursor' }
      })
      .mockResolvedValueOnce({
        messages: [{ ts: '1722000000.000002', text: 'second <@U123>', user: 'U789' }],
        response_metadata: { next_cursor: 'repeated-cursor' }
      })

    const items = await new SlackCollector().collect(range, config)

    expect(items.map(item => item.title)).toEqual(['first <@U123>'])
    expect(mockConversationsHistory).toHaveBeenCalledTimes(2)
  })

  it('isolates a conversations.history failure to its channel instead of discarding other channels', async () => {
    mockUsersConversations.mockResolvedValueOnce({
      channels: [{ id: 'C-OK' }, { id: 'C-FAILS' }],
      response_metadata: { next_cursor: '' }
    })
    mockConversationsHistory.mockImplementation(({ channel }) => {
      if (channel === 'C-FAILS') return Promise.reject(new Error('history unavailable'))
      return Promise.resolve({
        messages: [{ ts: '1722000000.000001', text: `<@U123> mention in ${channel}`, user: 'U456' }],
        response_metadata: { next_cursor: '' }
      })
    })

    const items = await new SlackCollector().collect(range, config)

    expect(items.map(item => item.metadata?.channel)).toEqual(['C-OK'])
  })
})
