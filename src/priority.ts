import { LinearClient } from '@linear/sdk'
import { Octokit } from 'octokit'
import type { Config } from './config.js'
import { getPrioritiesConfig } from './config.js'
import type { CollectedItem } from './types.js'

export type LinearPriorityItem = CollectedItem & { source: 'linear'; type: 'task' }
export type GitHubPriorityItem = CollectedItem & {
  source: 'github'
  type: 'pr_created' | 'pr_reviewed' | 'pr_assigned'
}
export type PriorityItem = LinearPriorityItem | GitHubPriorityItem

export interface PriorityResult {
  linear: LinearPriorityItem[]
  staleCreated: GitHubPriorityItem[]
  pendingReview: GitHubPriorityItem[]
}

async function resolveOptional<T>(load: () => Promise<T> | T): Promise<T | null> {
  try {
    return (await load()) ?? null
  } catch {
    return null
  }
}

export class PriorityEngine {
  async collect(config: Config): Promise<PriorityResult> {
    const p = getPrioritiesConfig(config)
    const linear = await this.fetchLinearTasks(config, p.linear.statuses)
    const staleCreated = await this.fetchStaleCreated(config, p.github.created)
    const pendingReview = await this.fetchPendingReview(config, p.github.pendingReview)
    return { linear, staleCreated, pendingReview }
  }

  private async fetchLinearTasks(config: Config, statuses: string[]): Promise<LinearPriorityItem[]> {
    const client = new LinearClient({ apiKey: config.linear.apiKey })
    const me = await client.viewer
    const issues = await client.issues({
      filter: { assignee: { id: { eq: me.id } } },
      first: 50
    })
    const resolved = await Promise.all(issues.nodes.map(async i => {
      const [state, project, cycle] = await Promise.all([
        resolveOptional(() => i.state),
        resolveOptional(() => i.project),
        resolveOptional(() => i.cycle)
      ])
      return { ...i, state, project, cycle }
    }))
    return resolved
      .filter(i => i.state && statuses.includes(i.state.name))
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .map(i => ({
        id: `linear-${i.id}`, source: 'linear' as const, type: 'task' as const,
        title: i.title, url: i.url, status: i.state?.name ?? null,
        timestamp: new Date(i.updatedAt), description: null,
        metadata: {
          identifier: i.identifier,
          priority: i.priority,
          dueDate: i.dueDate ?? null,
          project: i.project?.name ?? null,
          cycle: i.cycle?.name ?? (typeof i.cycle?.number === 'number' ? `Cycle ${i.cycle.number}` : null)
        }
      }))
  }

  private async fetchStaleCreated(config: Config, opts: { minAgeDays: number; updatedAfterDays: number }): Promise<GitHubPriorityItem[]> {
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
        timestamp: new Date(pr.created_at), description: null,
        metadata: { updatedAt: pr.updated_at }
      }))
  }

  private async fetchPendingReview(config: Config, opts: { minAgeDays: number; updatedAfterDays: number }): Promise<GitHubPriorityItem[]> {
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
        metadata: { author: pr.user?.login ?? null, updatedAt: pr.updated_at }
      }))
  }
}

export function renderPriorities(result: PriorityResult): string {
  const lines: string[] = ['# Priorities', '']

  if (result.linear.length) {
    lines.push('## Linear Tasks')
    lines.push('| Title | Status | Updated | Link |')
    lines.push('|-------|--------|---------|------|')
    for (const item of result.linear) {
      const days = Math.round((Date.now() - item.timestamp.getTime()) / 86400000)
      lines.push(`| ${item.title} | ${item.status} | ${days}d ago | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  if (result.staleCreated.length) {
    lines.push('## Stale PRs (Created)')
    lines.push('| Title | Age | Updated | Link |')
    lines.push('|-------|-----|---------|------|')
    for (const item of result.staleCreated) {
      const age = Math.round((Date.now() - item.timestamp.getTime()) / 86400000)
      lines.push(`| ${item.title} | ${age}d | ${item.status} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  if (result.pendingReview.length) {
    lines.push('## PRs Awaiting Your Review')
    lines.push('| Title | Age | Author | Link |')
    lines.push('|-------|-----|--------|------|')
    for (const item of result.pendingReview) {
      const age = Math.round((Date.now() - item.timestamp.getTime()) / 86400000)
      const author = (item.metadata?.author as string) ?? '-'
      lines.push(`| ${item.title} | ${age}d | ${author} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  if (!result.linear.length && !result.staleCreated.length && !result.pendingReview.length) {
    lines.push('Nothing to do. You\'re all caught up!')
    lines.push('')
  }

  return lines.join('\n')
}
