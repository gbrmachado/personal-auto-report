import { LinearClient } from '@linear/sdk'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange, StatusChange, LinkedPR } from '../types.js'
import type { Config } from '../config.js'

async function resolveOptional<T>(load: () => Promise<T> | T): Promise<T | null> {
  try {
    return (await load()) ?? null
  } catch {
    return null
  }
}

async function fetchWorkflowStateNames(client: LinearClient): Promise<Map<string, string>> {
  const states = await resolveOptional(() => client.workflowStates({ first: 250 }))
  const map = new Map<string, string>()
  for (const state of states?.nodes ?? []) map.set(state.id, state.name)
  return map
}

async function fetchStatusHistory(
  issue: { history: (variables?: { first?: number }) => Promise<{ nodes: unknown[] } | undefined> },
  stateNames: Map<string, string>
): Promise<StatusChange[] | null> {
  const history = await resolveOptional(() => issue.history({ first: 50 }))
  if (!history) return null

  const changes = (history.nodes as Array<{
    toStateId?: string
    fromStateId?: string
    createdAt: string | Date
  }>)
    .filter(entry => entry.toStateId && entry.toStateId !== entry.fromStateId)
    .map(entry => ({
      from: entry.fromStateId ? stateNames.get(entry.fromStateId) ?? null : null,
      to: entry.toStateId ? stateNames.get(entry.toStateId) ?? 'Unknown' : 'Unknown',
      changedAt: new Date(entry.createdAt)
    }))
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())

  return changes
}

const GITHUB_PR_URL_RE = /github\.com\/[^/]+\/[^/]+\/pull\/\d+/i

function isGitHubPullRequestAttachment(sourceType: string | undefined, url: string): boolean {
  if (sourceType !== 'github') return false
  return GITHUB_PR_URL_RE.test(url)
}

function parseRepoFromGitHubUrl(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/\d+/i)
  return match ? `${match[1]}/${match[2]}` : null
}

function parseRepoFromSubtitle(subtitle: string | undefined): string | null {
  if (!subtitle) return null
  const match = subtitle.match(/^([^/]+\/[^/]+)\s*•/)
  return match?.[1] ?? null
}

function mapGitHubAttachmentToLinkedPR(a: {
  title: string
  url: string
  subtitle?: string
  metadata?: Record<string, unknown>
}): LinkedPR {
  const meta = a.metadata ?? {}
  const repoLogin = typeof meta.repoLogin === 'string' ? meta.repoLogin : null
  const repoName = typeof meta.repoName === 'string' ? meta.repoName : null
  const repoFromMeta = repoLogin && repoName ? `${repoLogin}/${repoName}` : null
  return {
    title: a.title,
    url: a.url,
    repo: repoFromMeta ?? parseRepoFromGitHubUrl(a.url) ?? parseRepoFromSubtitle(a.subtitle),
    status: typeof meta.status === 'string' ? meta.status : null,
    mergedAt: typeof meta.mergedAt === 'string' ? meta.mergedAt : null,
    closedAt: typeof meta.closedAt === 'string' ? meta.closedAt : null,
    linkKind: typeof meta.linkKind === 'string' ? meta.linkKind : null
  }
}

async function fetchLinkedPRs(
  issue: { attachments: () => Promise<{ nodes: unknown[] } | undefined> }
): Promise<LinkedPR[]> {
  const attachments = await resolveOptional(() => issue.attachments())
  if (!attachments?.nodes) return []

  return (attachments.nodes as Array<{
    sourceType?: string
    title: string
    url: string
    subtitle?: string
    metadata?: Record<string, unknown>
  }>)
    .filter(a => isGitHubPullRequestAttachment(a.sourceType, a.url))
    .map(mapGitHubAttachmentToLinkedPR)
}

export class LinearCollector implements Collector {
  readonly name = 'linear'

  async collect(range: DateRange, config: Config): Promise<CollectedItem[]> {
    const client = new LinearClient({ apiKey: config.linear.apiKey })
    const me = await client.viewer
    const [issues, stateNames] = await Promise.all([
      client.issues({
        filter: {
          assignee: { id: { eq: me.id } },
          updatedAt: { gte: range.start.toISOString() }
        }
      }),
      fetchWorkflowStateNames(client)
    ])
    return Promise.all(issues.nodes.map(async issue => {
      const [state, team, project, statusHistory, linkedPRs] = await Promise.all([
        issue.state,
        issue.team,
        issue.project,
        fetchStatusHistory(issue, stateNames),
        fetchLinkedPRs(issue)
      ])
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
          identifier: issue.identifier,
          startedAt: issue.startedAt ? new Date(issue.startedAt).toISOString() : null,
          completedAt: issue.completedAt ? new Date(issue.completedAt).toISOString() : null,
          linkedPRs
        },
        statusHistory
      }
    }))
  }
}
