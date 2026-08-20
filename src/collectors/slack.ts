import { WebClient } from '@slack/web-api'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'
import type { Config } from '../config.js'

function paginationCursor(
  value: string | undefined,
  seen: Set<string>,
  operation: string
): string | undefined {
  const cursor = value?.trim() || undefined
  if (!cursor) return undefined
  if (seen.has(cursor)) {
    throw new Error(`Slack ${operation} returned a repeated pagination cursor`)
  }
  seen.add(cursor)
  return cursor
}

export class SlackCollector implements Collector {
  readonly name = 'slack'

  async collect(range: DateRange, config: Config): Promise<CollectedItem[]> {
    const client = new WebClient(config.slack.token)
    const userId = config.user.slack
    const items: CollectedItem[] = []

    const channelIds: string[] = []
    const seenChannelCursors = new Set<string>()
    let channelCursor: string | undefined
    do {
      const conversations = await client.users.conversations({
        user: userId,
        types: 'public_channel,private_channel',
        limit: 200,
        ...(channelCursor ? { cursor: channelCursor } : {})
      })
      channelIds.push(...(conversations.channels ?? []).flatMap(channel =>
        channel.id ? [channel.id] : []
      ))
      channelCursor = paginationCursor(
        conversations.response_metadata?.next_cursor,
        seenChannelCursors,
        'users.conversations'
      )
    } while (channelCursor)

    for (const channelId of channelIds) {
      try {
        const seenMessageCursors = new Set<string>()
        let messageCursor: string | undefined
        do {
          const history = await client.conversations.history({
            channel: channelId,
            oldest: String(range.start.getTime() / 1000),
            latest: String(range.end.getTime() / 1000),
            limit: 200,
            ...(messageCursor ? { cursor: messageCursor } : {})
          })

          messageCursor = paginationCursor(
            history.response_metadata?.next_cursor,
            seenMessageCursors,
            'conversations.history'
          )

          for (const msg of history.messages ?? []) {
            const mentions = (msg.text ?? '').match(/<@(\w+)>/g) ?? []
            if (mentions.some(m => m.includes(userId))) {
              items.push({
                id: `slack-${channelId}-${msg.ts}`,
                source: 'slack',
                type: 'slack_message',
                title: (msg.text ?? '').slice(0, 200),
                url: null,
                status: null,
                timestamp: new Date(Number(msg.ts) * 1000),
                description: msg.text ?? null,
                metadata: { channel: channelId, user: msg.user ?? null }
              })
            }
          }
        } while (messageCursor)
      } catch {
        continue
      }
    }

    return items
  }
}
