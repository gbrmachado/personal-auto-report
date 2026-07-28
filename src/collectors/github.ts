import { Octokit } from 'octokit'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'
import type { Config } from '../config.js'

function parseRepo(repositoryUrl?: string): { owner: string; repo: string } | null {
  if (!repositoryUrl) return null
  const parts = repositoryUrl.replace('https://api.github.com/repos/', '').split('/')
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1]?.replace(/\?.+$/, '') ?? '' }
}

export class GitHubCollector implements Collector {
  readonly name = 'github'

  async collect(range: DateRange, config: Config): Promise<CollectedItem[]> {
    const octokit = new Octokit({ auth: config.github.token })
    const username = config.user.github
    const dateStr = range.start.toISOString().split('T')[0]
    const items: CollectedItem[] = []

    const created = await octokit.rest.search.issuesAndPullRequests({
      q: `author:${username} type:pr created:>=${dateStr}`
    })
    for (const pr of created.data.items) {
      const repoInfo = parseRepo(pr.repository_url)
      items.push({
        id: `gh-created-${pr.id}`,
        source: 'github',
        type: 'pr_created',
        title: pr.title,
        url: pr.html_url,
        status: pr.state,
        timestamp: new Date(pr.created_at),
        description: pr.body ?? null,
        metadata: { repo: repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null }
      })
    }

    const reviewed = await octokit.rest.search.issuesAndPullRequests({
      q: `reviewed-by:${username} type:pr updated:>=${dateStr}`
    })
    for (const pr of reviewed.data.items) {
      const repoInfo = parseRepo(pr.repository_url)
      const prNumber = (pr as { number?: number }).number

      let reviewTimestamp = new Date(pr.updated_at)
      let reviewStatus = pr.state

      if (repoInfo && prNumber) {
        try {
          const reviews = await octokit.rest.pulls.listReviews({
            owner: repoInfo.owner,
            repo: repoInfo.repo,
            pull_number: prNumber
          })
          const myReviews = reviews.data.filter(
            r => r.user?.login === username
          )
          if (myReviews.length > 0) {
            const latest = myReviews.reduce((latest, r) =>
              (r.submitted_at && (!latest || r.submitted_at > latest)) ? r.submitted_at : latest,
              null as string | null
            )
            if (latest) reviewTimestamp = new Date(latest)
            reviewStatus = myReviews[myReviews.length - 1]?.state ?? pr.state
          }
        } catch {
          // Fall through — use search timestamp approximation
        }
      }

      items.push({
        id: `gh-reviewed-${pr.id}`,
        source: 'github',
        type: 'pr_reviewed',
        title: pr.title,
        url: pr.html_url,
        status: reviewStatus,
        timestamp: reviewTimestamp,
        description: pr.body ?? null,
        metadata: { repo: repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null }
      })
    }

    return items
  }
}
