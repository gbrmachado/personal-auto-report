import { LinearClient } from '@linear/sdk'
import { Octokit } from 'octokit'
import type { Config } from './config.js'
import { getPrioritiesConfig } from './config.js'
import type { CollectedItem } from './types.js'

export interface PriorityResult {
  linear: CollectedItem[]
  staleCreated: CollectedItem[]
  pendingReview: CollectedItem[]
}

export class PriorityEngine {
  async collect(config: Config): Promise<PriorityResult> {
    const p = getPrioritiesConfig(config)
    const linear = await this.fetchLinearTasks(config, p.linear.statuses)
    const staleCreated = await this.fetchStaleCreated(config, p.github.created)
    const pendingReview = await this.fetchPendingReview(config, p.github.pendingReview)
    return { linear, staleCreated, pendingReview }
  }

  private async fetchLinearTasks(config: Config, statuses: string[]): Promise<CollectedItem[]> {
    const client = new LinearClient({ apiKey: config.linear.apiKey })
    const me = await client.viewer
    const issues = await client.issues({
      filter: { assignee: { id: { eq: me.id } } },
      first: 50
    })
    return issues.nodes
      .filter(i => i.state && statuses.includes(i.state.name))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .map(i => ({
        id: `linear-${i.id}`, source: 'linear' as const, type: 'task' as const,
        title: i.title, url: i.url, status: i.state?.name ?? null,
        timestamp: new Date(i.updatedAt), description: null, metadata: null
      }))
  }

  private async fetchStaleCreated(config: Config, opts: { minAgeDays: number; updatedAfterDays: number }): Promise<CollectedItem[]> {
    const octokit = new Octokit({ auth: config.github.token })
    const now = Date.now()
    const minAge = now - opts.minAgeDays * 86400000
    const staleCutoff = now - opts.updatedAfterDays * 86400000

    const { data } = await octokit.request('GET /search/issues', {
      q: `author:${config.user.github} type:pr is:open`,
      per_page: 50
    })
    return data.items
      .filter((pr: any) => new Date(pr.created_at).getTime() < minAge && new Date(pr.updated_at).getTime() < staleCutoff)
      .map((pr: any) => ({
        id: `gh-stale-${pr.id}`, source: 'github' as const, type: 'pr_created' as const,
        title: pr.title, url: pr.html_url, status: pr.state,
        timestamp: new Date(pr.created_at), description: null, metadata: null
      }))
  }

  private async fetchPendingReview(config: Config, opts: { minAgeDays: number; updatedAfterDays: number }): Promise<CollectedItem[]> {
    const octokit = new Octokit({ auth: config.github.token })
    const now = Date.now()
    const minAge = now - opts.minAgeDays * 86400000
    const staleCutoff = now - opts.updatedAfterDays * 86400000

    const { data } = await octokit.request('GET /search/issues', {
      q: `review-requested:${config.user.github} type:pr is:open`,
      per_page: 50
    })
    return data.items
      .filter((pr: any) => new Date(pr.created_at).getTime() < minAge && new Date(pr.updated_at).getTime() < staleCutoff)
      .map((pr: any) => ({
        id: `gh-review-${pr.id}`, source: 'github' as const, type: 'pr_reviewed' as const,
        title: pr.title, url: pr.html_url, status: pr.state,
        timestamp: new Date(pr.created_at), description: null,
        metadata: { author: pr.user?.login ?? null }
      }))
  }
}
