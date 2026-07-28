import { LinearClient } from '@linear/sdk'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'
import type { Config } from '../config.js'

export class LinearCollector implements Collector {
  readonly name = 'linear'

  async collect(range: DateRange, config: Config): Promise<CollectedItem[]> {
    const client = new LinearClient({ apiKey: config.linear.apiKey })
    const me = await client.viewer
    const issues = await client.issues({
      filter: {
        assignee: { id: { eq: me.id } },
        updatedAt: { gte: range.start.toISOString() }
      }
    })
    return issues.nodes.map(issue => ({
      id: `linear-${issue.id}`,
      source: 'linear' as const,
      type: 'task' as const,
      title: issue.title,
      url: issue.url,
      status: issue.state?.name ?? null,
      timestamp: new Date(issue.updatedAt),
      description: issue.description ?? null,
      metadata: {
        priority: issue.priority,
        team: issue.team?.name ?? null,
        identifier: issue.identifier
      }
    }))
  }
}
