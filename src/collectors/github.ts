import { Octokit } from 'octokit'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'
import type { Config } from '../config.js'

export class GitHubCollector implements Collector {
  readonly name = 'github'

  async collect(range: DateRange, config: Config): Promise<CollectedItem[]> {
    const octokit = new Octokit({ auth: config.github.token })
    const username = config.user.github
    const items: CollectedItem[] = []

    const created = await octokit.search.issuesAndPullRequests({
      q: `author:${username} type:pr updated:>=${range.start.toISOString().split('T')[0]}`
    })
    for (const pr of created.data.items) {
      items.push({
        id: `gh-created-${pr.id}`,
        source: 'github',
        type: 'pr_created',
        title: pr.title,
        url: pr.html_url,
        status: pr.state,
        timestamp: new Date(pr.updated_at),
        description: pr.body,
        metadata: { repo: pr.repository_url?.split('/').slice(-2).join('/') ?? null }
      })
    }

    const reviewed = await octokit.search.issuesAndPullRequests({
      q: `reviewed-by:${username} type:pr updated:>=${range.start.toISOString().split('T')[0]}`
    })
    for (const pr of reviewed.data.items) {
      items.push({
        id: `gh-reviewed-${pr.id}`,
        source: 'github',
        type: 'pr_reviewed',
        title: pr.title,
        url: pr.html_url,
        status: pr.state,
        timestamp: new Date(pr.updated_at),
        description: pr.body,
        metadata: { repo: pr.repository_url?.split('/').slice(-2).join('/') ?? null }
      })
    }

    return items
  }
}
