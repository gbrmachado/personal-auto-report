# Priorities Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `review priorities` CLI command and MCP tool showing actionable Linear tasks, stale authored PRs, and pending review requests.

**Architecture:** New `PriorityEngine` orchestrator in `src/priority.ts` reuses existing API clients (Linear SDK, Octokit) with different filters. Config added to existing `config.json` with sensible defaults.

**Tech Stack:** Same as project — Node 20, TypeScript, `@linear/sdk`, `octokit`, `commander`, `@modelcontextprotocol/sdk`.

## Global Constraints

- New `priorities` config section is optional — default values when absent
- Linear: fetch tasks assigned to user, filter by configured statuses, sort by updatedAt ascending
- GitHub: use `octokit.request('GET /search/issues', ...)` (not deprecated API)
- Max 50 results per source
- Each source runs independently; failures produce warnings
- Tests use `vi.mock` (no real API calls)
- Follow existing code patterns in `src/review.ts`, `src/collectors/`, `src/mcp-server.ts`

---

### Task 1: Config + Types

**Files:**
- Modify: `src/config.ts` — add `PrioritiesConfig` interface, defaults, `getPrioritiesConfig()`
- Create: `tests/priority.test.ts` — test config defaults
- Modify: `README.md` — document priorities config

**Interfaces:**
- Produces: `PrioritiesConfig`, `LinearPriorityConfig`, `GitHubPriorityConfig`, `getPrioritiesConfig()`

- [ ] **Step 1: Add types to src/config.ts**

```typescript
export interface GitHubPriorityConfig {
  minAgeDays: number
  updatedAfterDays: number
}

export interface PrioritiesConfig {
  linear: { statuses: string[] }
  github: {
    created: GitHubPriorityConfig
    pendingReview: GitHubPriorityConfig
  }
}

const DEFAULT_PRIORITIES: PrioritiesConfig = {
  linear: { statuses: ['In Progress', 'Todo', 'Backlog'] },
  github: {
    created: { minAgeDays: 14, updatedAfterDays: 7 },
    pendingReview: { minAgeDays: 7, updatedAfterDays: 3 }
  }
}

export function getPrioritiesConfig(config: Config): PrioritiesConfig {
  return config.priorities ?? DEFAULT_PRIORITIES
}
```

- [ ] **Step 2: Write test for priority config defaults**

```typescript
import { describe, it, expect } from 'vitest'

describe('getPrioritiesConfig', () => {
  it('uses defaults when no priorities section exists', async () => {
    const { getPrioritiesConfig } = await import('../src/config.js')
    const config = { linear: { apiKey: 't' }, github: { token: 't' }, slack: { token: 't' },
      user: { linear: 'a', github: 'a', slack: 'a' },
      ai: { provider: 'openai', apiKey: 't', model: 'm' },
      db: { path: ':memory:' } } as any
    const p = getPrioritiesConfig(config)
    expect(p.linear.statuses).toContain('Todo')
    expect(p.github.created.minAgeDays).toBe(14)
  })

  it('returns configured values when present', async () => {
    const { getPrioritiesConfig } = await import('../src/config.js')
    const config = { priorities: { linear: { statuses: ['In Progress'] },
      github: { created: { minAgeDays: 7, updatedAfterDays: 3 },
        pendingReview: { minAgeDays: 3, updatedAfterDays: 1 } } } } as any
    const p = getPrioritiesConfig(config)
    expect(p.linear.statuses).toEqual(['In Progress'])
    expect(p.github.created.minAgeDays).toBe(7)
  })
})
```

- [ ] **Step 3: Implement in src/config.ts**

Add the types, defaults, and `getPrioritiesConfig()` function.

- [ ] **Step 4: Run `npm test` — verify passes**

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/priority.test.ts README.md
git commit -m "feat: add PrioritiesConfig interface and defaults"
```

---

### Task 2: PriorityEngine

**Files:**
- Create: `src/priority.ts`
- Create: `tests/priority.test.ts` (append new tests)

**Interfaces:**
- Consumes: `Config`, `PrioritiesConfig`, `CollectedItem`, `DateRange`
- Produces: `PriorityEngine.collect()` returning `PriorityResult`

- [ ] **Step 1: Write failing test for PriorityEngine**

```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: Promise.resolve({ id: 'user-1' }),
    issues: vi.fn().mockResolvedValue({
      nodes: [
        { id: 'i1', title: 'Fix bug', url: 'https://linear.app/t/FIX-1',
          updatedAt: '2026-07-20T10:00:00.000Z', state: { name: 'In Progress' },
          priority: 2, team: null, identifier: 'FIX-1', description: null,
          assignee: { id: 'user-1' } }
      ]
    })
  }))
}))

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn()
}))

vi.mock('octokit', () => ({
  Octokit: vi.fn(() => ({ request: mockRequest }))
}))

import { PriorityEngine } from '../src/priority.js'

describe('PriorityEngine', () => {
  it('returns linear tasks filtered by configured statuses', async () => {
    const engine = new PriorityEngine()
    const result = await engine.collect({
      linear: { apiKey: 't' }, github: { token: 't' },
      slack: { token: 't' }, user: { linear: 'm@x.com', github: 'me', slack: 'U1' },
      ai: { provider: 'openai', apiKey: 't', model: 'm' },
      db: { path: ':memory:' },
    } as any)
    expect(result.linear).toHaveLength(1)
    expect(result.linear[0].title).toBe('Fix bug')
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```bash
npm test -- tests/priority.test.ts
```

Expected: FAIL with "Module not found" or "PriorityEngine not defined"

- [ ] **Step 3: Write minimal PriorityEngine implementation**

```typescript
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
```

- [ ] **Step 4: Run test — verify it passes**

```bash
npm test -- tests/priority.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/priority.ts tests/priority.test.ts
git commit -m "feat: PriorityEngine with Linear tasks and stale GitHub PRs"
```

---

### Task 3: CLI Command

**Files:**
- Modify: `src/index.ts` — add `review priorities` command
- Create or modify: `src/priority.ts` — add `renderPriorities()` and `generatePriorities()`

- [ ] **Step 1: Add renderPriorities to src/priority.ts**

```typescript
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
```

- [ ] **Step 2: Add priorities CLI command to src/index.ts**

```typescript
program
  .command('priorities')
  .description('Show prioritized tasks and stale PRs')
  .option('--ai', 'Include AI recommendations')
  .action(async (options) => {
    const { loadConfig } = await import('./config.js')
    const { PriorityEngine, renderPriorities } = await import('./priority.js')
    const config = loadConfig()
    const engine = new PriorityEngine()
    const result = await engine.collect(config)
    const md = renderPriorities(result)
    if (options.ai) {
      const items = [...result.linear, ...result.staleCreated, ...result.pendingReview]
      const { generateSummary } = await import('./summarizer.js')
      const aiSummary = await generateSummary(items, config, 'priorities')
      console.log(md.replace('# Priorities', `# Priorities\n\n## AI Recommendations\n${aiSummary}\n`))
    } else {
      console.log(md)
    }
  })
```

- [ ] **Step 3: Write render test**

```typescript
import { describe, it, expect } from 'vitest'
import { renderPriorities, PriorityResult } from '../src/priority.js'

describe('renderPriorities', () => {
  it('shows all caught up when empty', () => {
    const result: PriorityResult = { linear: [], staleCreated: [], pendingReview: [] }
    const md = renderPriorities(result)
    expect(md).toContain('Nothing to do')
  })

  it('renders linear tasks', () => {
    const result: PriorityResult = {
      linear: [{ id: '1', source: 'linear', type: 'task', title: 'Fix bug',
        url: 'https://linear.app/t/FIX-1', status: 'In Progress',
        timestamp: new Date(Date.now() - 86400000), description: null, metadata: null }],
      staleCreated: [], pendingReview: []
    }
    const md = renderPriorities(result)
    expect(md).toContain('Fix bug')
    expect(md).toContain('1d ago')
  })
})
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/priority.ts tests/priority.test.ts
git commit -m "feat: review priorities CLI command with renderer"
```

---

### Task 4: MCP Tool

**Files:**
- Modify: `src/mcp-server.ts` — add `review_priorities` tool

- [ ] **Step 1: Add tool to ListToolsRequestSchema**

```typescript
{
  name: 'review_priorities',
  description: 'Show prioritized tasks and stale PRs',
  inputSchema: {
    type: 'object',
    properties: {
      ai: { type: 'boolean', description: 'Include AI recommendations' }
    }
  }
}
```

- [ ] **Step 2: Add handler to CallToolRequestSchema**

```typescript
case 'review_priorities':
  const { PriorityEngine, renderPriorities } = await import('./priority.js')
  const { loadConfig } = await import('./config.js')
  const config = loadConfig()
  const engine = new PriorityEngine()
  const result = await engine.collect(config)
  markdown = renderPriorities(result)
  if (ai) {
    const items = [...result.linear, ...result.staleCreated, ...result.pendingReview]
    const summary = await (await import('./summarizer.js')).generateSummary(items, config, 'priorities')
    markdown = markdown.replace('# Priorities', `# Priorities\n\n## AI Recommendations\n${summary}\n`)
  }
  break
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/mcp-server.ts
git commit -m "feat: add review_priorities MCP tool"
```
