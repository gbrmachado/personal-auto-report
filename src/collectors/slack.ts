import { WebClient } from '@slack/web-api'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'
import type { Config } from '../config.js'

export class SlackCollector implements Collector {
  readonly name = 'slack'

  async collect(range: DateRange, config: Config): Promise<CollectedItem[]> {
    const client = new WebClient(config.slack.token)
    const userId = config.user.slack
    const items: CollectedItem[] = []

    const conversations = await client.users.conversations({ user: userId, types: 'public_channel,private_channel' })
    const channelIds = (conversations.channels ?? []).map(c => c.id!).slice(0, 10)

    for (const channelId of channelIds) {
      try {
        const history = await client.conversations.history({
          channel: channelId,
          oldest: String(range.start.getTime() / 1000),
          latest: String(range.end.getTime() / 1000)
        })

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
      } catch {
        continue
      }
    }

    return items
  }
}
