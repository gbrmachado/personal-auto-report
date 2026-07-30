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
    return Promise.all(issues.nodes.map(async issue => {
      const [state, team, project] = await Promise.all([issue.state, issue.team, issue.project])
      return {
        id: `linear-${issue.id}`,
        source: 'linear' as const,
        type: 'task' as const,
        title: issue.title,
        url: issue.url,
        status: state?.name ?? null,
        timestamp: new Date(issue.updatedAt),
        description: issue.description ?? null,
        metadata: {
          priority: issue.priority,
          team: team?.name ?? null,
          project: project?.name ?? null,
          identifier: issue.identifier
        }
      }
    }))
  }
}
