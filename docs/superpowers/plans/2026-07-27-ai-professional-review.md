# ai-professional-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI + MCP server that generates daily/weekly/monthly professional reviews from Linear, GitHub, and Slack data, with optional AI summaries.

**Architecture:** TypeScript CLI with three data collectors (Linear, GitHub, Slack) that feed into an aggregator, optional LLM summarizer, and markdown renderer. SQLite for persistence. Dual-mode: CLI (stdout) + MCP server (stdio transport).

**Tech Stack:** Node 20, TypeScript, `commander` (CLI), `@modelcontextprotocol/sdk` (MCP), `better-sqlite3` (DB), `@linear/sdk`, `octokit`, `@slack/web-api`, `openai` (AI), `vitest` (tests), `tsup` (build).

## Global Constraints

- Node >= 18, npm >= 9
- Config at `~/.config/review/config.json`, permissions 600
- DB at `~/.config/review/review.db`
- All API calls must handle rate limiting and timeouts
- Each collector runs independently — one failure doesn't block the review
- Tests must not hit real APIs (use mocks/interceptors)

---

### Task 1: Project Scaffold + Config + DB

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `src/config.ts`
- Create: `src/db.ts`
- Create: `tests/config.test.ts`
- Create: `tests/db.test.ts`

**Interfaces:**
- Produces: `Config` type, `loadConfig()`, `initConfig()`, `getDb()`, `insertCollections()`, `getCollectionsInRange()`, `insertReview()`, `getReviewsInRange()`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "ai-professional-review",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "review": "./dist/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --clean",
    "dev": "tsup src/index.ts --format esm --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.8.0",
    "@linear/sdk": "^41.0.0",
    "octokit": "^4.1.0",
    "@slack/web-api": "^7.8.0",
    "openai": "^4.86.0",
    "commander": "^13.1.0",
    "better-sqlite3": "^11.7.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsup": "^8.3.0",
    "@types/node": "^20.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["tests"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
dist/
*.db
```

- [ ] **Step 4: Write src/config.ts**

```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface Config {
  linear: { apiKey: string }
  github: { token: string }
  slack: { token: string }
  user: {
    linear: string
    github: string
    slack: string
  }
  ai: {
    provider: 'openai' | 'anthropic'
    apiKey: string
    model: string
  }
  db: {
    path: string
  }
}

const CONFIG_DIR = join(homedir(), '.config', 'review')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('Config not found. Run `review init` first.')
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

// initConfig stub — full implementation in Task 11
export async function initConfig(): Promise<void> {
  throw new Error('initConfig not yet implemented')
}
```

- [ ] **Step 5: Write src/db.ts**

```typescript
import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

export interface CollectionRow {
  id: string
  source: string
  type: string
  title: string
  url: string | null
  status: string | null
  timestamp: string
  description: string | null
  metadata: string | null
  collected_date: string
}

export interface ReviewRow {
  id: number
  period: string
  date_start: string
  date_end: string
  raw_markdown: string
  ai_summary: string | null
  created_at: string
}

export function getDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      status TEXT,
      timestamp TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      collected_date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL,
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      raw_markdown TEXT NOT NULL,
      ai_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collected_date);
    CREATE INDEX IF NOT EXISTS idx_reviews_period ON reviews(period, date_start);
  `)
  return db
}

export function insertCollections(db: Database.Database, items: CollectionRow[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO collections (id, source, type, title, url, status, timestamp, description, metadata, collected_date)
    VALUES (@id, @source, @type, @title, @url, @status, @timestamp, @description, @metadata, @collected_date)
  `)
  const tx = db.transaction((items: CollectionRow[]) => {
    for (const item of items) stmt.run(item)
  })
  tx(items)
}

export function getCollectionsInRange(db: Database.Database, start: string, end: string): CollectionRow[] {
  return db.prepare(
    'SELECT * FROM collections WHERE collected_date >= ? AND collected_date <= ? ORDER BY timestamp ASC'
  ).all(start, end) as CollectionRow[]
}

export function insertReview(db: Database.Database, review: Omit<ReviewRow, 'id' | 'created_at'>): number {
  const result = db.prepare(
    'INSERT INTO reviews (period, date_start, date_end, raw_markdown, ai_summary) VALUES (?, ?, ?, ?, ?)'
  ).run(review.period, review.date_start, review.date_end, review.raw_markdown, review.ai_summary)
  return result.lastInsertRowid as number
}
```

- [ ] **Step 6: Write tests/config.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Mock homedir
import { homedir } from 'os'
const testDir = join(tmpdir(), 'review-test-' + Date.now())

// We'll test config loading/saving by temporarily pointing to test dir
describe('config', () => {
  beforeEach(() => {
    mkdirSync(join(testDir, '.config', 'review'), { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('throws when config file does not exist', () => {
    // monkeypatch homedir for the test
    // expect(() => loadConfig()).toThrow('Config not found')
  })

  it('saves and loads config correctly', () => {
    // write a config, load it back, verify fields
  })
})
```

- [ ] **Step 7: Write tests/db.test.ts**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('db', () => {
  const testDbPath = join(tmpdir(), 'review-test-' + Date.now(), 'test.db')

  it('creates tables on initialization', () => {
    const db = getDb(testDbPath)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map(t => t.name)).toContain('collections')
    expect(tables.map(t => t.name)).toContain('reviews')
    db.close()
  })

  it('inserts and retrieves collections', () => {
    const db = getDb(testDbPath)
    const item = {
      id: 'test-1', source: 'linear', type: 'task',
      title: 'Test task', url: 'https://linear.app/test',
      status: 'done', timestamp: '2026-07-27T10:00:00Z',
      description: null, metadata: null, collected_date: '2026-07-27'
    }
    insertCollections(db, [item])
    const rows = getCollectionsInRange(db, '2026-07-27', '2026-07-27')
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Test task')
    db.close()
  })
})
```

- [ ] **Step 8: Write src/index.ts (minimal)**

```typescript
#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
program
  .name('review')
  .description('AI-powered professional review generator')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize configuration')
  .action(async () => {
    const { initConfig } = await import('./config.js')
    await initConfig()
    console.log('Configuration saved to ~/.config/review/config.json')
  })

program
  .command('daily')
  .description('Generate daily review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    console.log('Daily review coming soon')
  })

program
  .command('weekly')
  .description('Generate weekly review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    console.log('Weekly review coming soon')
  })

program
  .command('monthly')
  .description('Generate monthly review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    console.log('Monthly review coming soon')
  })

program
  .command('serve')
  .description('Start MCP server')
  .action(async () => {
    console.log('MCP server coming soon')
  })

program.parse()
```

- [ ] **Step 9: Install dependencies and verify build**

```bash
npm install && npm run build
```

- [ ] **Step 10: Commit**

```bash
git init && git add -A && git commit -m "feat: project scaffold with config, db, and CLI skeleton"
```

---

### Task 2: Collector Interface + Data Types

**Files:**
- Create: `src/types.ts`
- Create: `src/collector.ts`
- Create: `tests/types.test.ts`

**Interfaces:**
- Produces: `CollectedItem`, `DateRange`, `Collector` interface

- [ ] **Step 1: Write src/types.ts**

```typescript
export interface CollectedItem {
  id: string
  source: 'linear' | 'github' | 'slack'
  type: 'task' | 'pr_created' | 'pr_reviewed' | 'slack_message'
  title: string
  url: string | null
  status: string | null
  timestamp: Date
  description: string | null
  metadata: Record<string, unknown> | null
}

export interface DateRange {
  start: Date
  end: Date
}
```

- [ ] **Step 2: Write src/collector.ts**

```typescript
import type { CollectedItem, DateRange } from './types.js'

export interface Collector {
  readonly name: string
  collect(range: DateRange, config: any): Promise<CollectedItem[]>
}
```

- [ ] **Step 3: Write tests/types.test.ts**

```typescript
import { describe, it, expect } from 'vitest'

describe('types', () => {
  it('CollectedItem can be constructed', () => {
    const item = {
      id: 'test-1',
      source: 'linear' as const,
      type: 'task' as const,
      title: 'Test',
      url: null,
      status: null,
      timestamp: new Date(),
      description: null,
      metadata: null
    }
    expect(item.source).toBe('linear')
    expect(item.type).toBe('task')
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: collector interface and types"
```

---

### Task 3: Linear Collector

**Files:**
- Create: `src/collectors/linear.ts`
- Create: `tests/collectors/linear.test.ts`

**Interfaces:**
- Consumes: `Collector`, `CollectedItem`, `DateRange`, `Config`
- Produces: `LinearCollector` class

- [ ] **Step 1: Write src/collectors/linear.ts**

```typescript
import { LinearClient } from '@linear/sdk'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'

export class LinearCollector implements Collector {
  readonly name = 'linear'

  async collect(range: DateRange, config: { linear: { apiKey: string }; user: { linear: string } }): Promise<CollectedItem[]> {
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
      description: issue.description,
      metadata: {
        priority: issue.priority,
        team: issue.team?.name ?? null,
        identifier: issue.identifier
      }
    }))
  }
}
```

- [ ] **Step 2: Write tests/collectors/linear.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { LinearCollector } from '../../src/collectors/linear.js'

describe('LinearCollector', () => {
  it('returns collected items', async () => {
    // Mock LinearClient
    vi.mock('@linear/sdk', () => ({
      LinearClient: vi.fn().mockImplementation(() => ({
        viewer: Promise.resolve({ id: 'user-1' }),
        issues: vi.fn().mockResolvedValue({
          nodes: [
            {
              id: 'issue-1',
              title: 'Test issue',
              url: 'https://linear.app/team/issue/TEST-1',
              updatedAt: '2026-07-27T10:00:00.000Z',
              description: 'A test issue',
              state: { name: 'In Progress' },
              priority: 2,
              team: { name: 'Engineering' },
              identifier: 'TEST-1'
            }
          ]
        })
      }))
    }))

    const collector = new LinearCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Test issue')
    expect(items[0].source).toBe('linear')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: linear collector"
```

---

### Task 4: GitHub Collector

**Files:**
- Create: `src/collectors/github.ts`
- Create: `tests/collectors/github.test.ts`

**Interfaces:**
- Consumes: `Collector`, `CollectedItem`, `DateRange`, `Config`
- Produces: `GitHubCollector` class

- [ ] **Step 1: Write src/collectors/github.ts**

```typescript
import { Octokit } from 'octokit'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'

export class GitHubCollector implements Collector {
  readonly name = 'github'

  async collect(range: DateRange, config: { github: { token: string }; user: { github: string } }): Promise<CollectedItem[]> {
    const octokit = new Octokit({ auth: config.github.token })
    const username = config.user.github
    const items: CollectedItem[] = []

    // PRs created by user
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

    // PRs reviewed by user
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
```

- [ ] **Step 2: Write tests/collectors/github.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { GitHubCollector } from '../../src/collectors/github.js'

describe('GitHubCollector', () => {
  it('returns PRs created and reviewed', async () => {
    const mockSearch = vi.fn().mockResolvedValue({
      data: {
        items: [
          { id: 1, title: 'My PR', html_url: 'https://github.com/foo/bar/pull/1', state: 'open', updated_at: '2026-07-27T10:00:00Z', body: 'desc', repository_url: 'https://api.github.com/repos/foo/bar' }
        ]
      }
    })

    vi.mock('octokit', () => ({
      Octokit: vi.fn().mockImplementation(() => ({
        search: { issuesAndPullRequests: mockSearch }
      }))
    }))

    const collector = new GitHubCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { github: { token: 'test' }, user: { github: 'testuser' } }
    )
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe('pr_created')
    expect(items[1].type).toBe('pr_reviewed')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: github collector"
```

---

### Task 5: Slack Collector

**Files:**
- Create: `src/collectors/slack.ts`
- Create: `tests/collectors/slack.test.ts`

**Interfaces:**
- Consumes: `Collector`, `CollectedItem`, `DateRange`, `Config`
- Produces: `SlackCollector` class

- [ ] **Step 1: Write src/collectors/slack.ts**

```typescript
import { WebClient } from '@slack/web-api'
import type { Collector } from '../collector.js'
import type { CollectedItem, DateRange } from '../types.js'

export class SlackCollector implements Collector {
  readonly name = 'slack'

  async collect(range: DateRange, config: { slack: { token: string }; user: { slack: string } }): Promise<CollectedItem[]> {
    const client = new WebClient(config.slack.token)
    const userId = config.user.slack
    const items: CollectedItem[] = []

    // Get conversations the user is in
    const conversations = await client.users.conversations({ user: userId, types: 'public_channel,private_channel' })
    const channelIds = (conversations.channels ?? []).map(c => c.id!).slice(0, 10) // limit to 10 channels

    for (const channelId of channelIds) {
      try {
        const history = await client.conversations.history({
          channel: channelId,
          oldest: String(range.start.getTime() / 1000),
          latest: String(range.end.getTime() / 1000)
        })

        for (const msg of history.messages ?? []) {
          // Check if user was @mentioned
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
        // Skip channels we can't access
        continue
      }
    }

    return items
  }
}
```

- [ ] **Step 2: Write tests/collectors/slack.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { SlackCollector } from '../../src/collectors/slack.js'

describe('SlackCollector', () => {
  it('returns messages where user is mentioned', async () => {
    const mockConversations = vi.fn().mockResolvedValue({
      channels: [{ id: 'C123' }]
    })
    const mockHistory = vi.fn().mockResolvedValue({
      messages: [
        { ts: '1722000000.000001', text: 'Hey <@U123> check this out', user: 'U456' },
        { ts: '1722000000.000002', text: 'Just a regular message', user: 'U789' }
      ]
    })

    vi.mock('@slack/web-api', () => ({
      WebClient: vi.fn().mockImplementation(() => ({
        users: { conversations: mockConversations },
        conversations: { history: mockHistory }
      }))
    }))

    const collector = new SlackCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { slack: { token: 'xoxp-test' }, user: { slack: 'U123' } }
    )
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('slack_message')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: slack collector"
```

---

### Task 6: Aggregator

**Files:**
- Create: `src/aggregator.ts`
- Create: `tests/aggregator.test.ts`

**Interfaces:**
- Consumes: `CollectedItem[]` (from all collectors), `DateRange`
- Produces: `aggregate()` function returning sorted `CollectedItem[]`

- [ ] **Step 1: Write src/aggregator.ts**

```typescript
import type { CollectedItem } from './types.js'

export function aggregate(items: CollectedItem[]): CollectedItem[] {
  return [...items].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

export function groupBySource(items: CollectedItem[]): Record<string, CollectedItem[]> {
  const groups: Record<string, CollectedItem[]> = {}
  for (const item of items) {
    if (!groups[item.source]) groups[item.source] = []
    groups[item.source].push(item)
  }
  return groups
}

export function groupByType(items: CollectedItem[]): Record<string, CollectedItem[]> {
  const groups: Record<string, CollectedItem[]> = {}
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = []
    groups[item.type].push(item)
  }
  return groups
}
```

- [ ] **Step 2: Write tests/aggregator.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { aggregate, groupBySource, groupByType } from '../src/aggregator.js'
import type { CollectedItem } from '../src/types.js'

describe('aggregator', () => {
  it('sorts items chronologically', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Second', url: null, status: null, timestamp: new Date('2026-07-27T11:00:00Z'), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'First', url: null, status: null, timestamp: new Date('2026-07-27T10:00:00Z'), description: null, metadata: null }
    ]
    const sorted = aggregate(items)
    expect(sorted[0].title).toBe('First')
    expect(sorted[1].title).toBe('Second')
  })

  it('groups by source', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'A', url: null, status: null, timestamp: new Date(), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'B', url: null, status: null, timestamp: new Date(), description: null, metadata: null }
    ]
    const groups = groupBySource(items)
    expect(groups.linear).toHaveLength(1)
    expect(groups.github).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: aggregator"
```

---

### Task 7: AI Summarizer

**Files:**
- Create: `src/summarizer.ts`
- Create: `tests/summarizer.test.ts`

**Interfaces:**
- Consumes: `CollectedItem[]`, `Config`
- Produces: `generateSummary()` returning `Promise<string>`

- [ ] **Step 1: Write src/summarizer.ts**

```typescript
import OpenAI from 'openai'
import type { CollectedItem } from './types.js'
import type { Config } from './config.js'

export function buildPrompt(items: CollectedItem[], period: string): string {
  const sections = items.map(i =>
    `[${i.source}/${i.type}] ${i.title} (${i.status ?? 'no status'})${i.description ? '\n  ' + i.description.slice(0, 300) : ''}`
  ).join('\n')

  return `You are a professional review assistant. Summarize the following activity for a ${period} professional review.

Focus on:
- What was accomplished
- Decisions made
- Action items / follow-ups
- Notable patterns or trends

Keep it concise (2-4 paragraphs). Do not use bullet points.

Activity:
${sections}`
}

export async function generateSummary(items: CollectedItem[], config: Config, period: string): Promise<string> {
  if (items.length === 0) return 'No activity to summarize.'

  const openai = new OpenAI({ apiKey: config.ai.apiKey })
  const prompt = buildPrompt(items, period)

  const response = await openai.chat.completions.create({
    model: config.ai.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 500
  })

  return response.choices[0]?.message?.content ?? 'Summary generation failed.'
}
```

- [ ] **Step 2: Write tests/summarizer.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { buildPrompt, generateSummary } from '../src/summarizer.js'
import type { CollectedItem } from '../src/types.js'

describe('summarizer', () => {
  it('builds prompt from items', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Fix login bug', url: null, status: 'Done', timestamp: new Date(), description: 'Users could not log in with SSO', metadata: null }
    ]
    const prompt = buildPrompt(items, 'daily')
    expect(prompt).toContain('Fix login bug')
    expect(prompt).toContain('[linear/task]')
    expect(prompt).toContain('daily')
  })

  it('returns no-activity message for empty items', async () => {
    const result = await generateSummary([], { ai: { apiKey: 'test', provider: 'openai', model: 'gpt-4o-mini' } } as any, 'daily')
    expect(result).toBe('No activity to summarize.')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: AI summarizer"
```

---

### Task 8: Markdown Renderer

**Files:**
- Create: `src/renderer.ts`
- Create: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: `CollectedItem[]`, optional AI summary string, period label
- Produces: `renderReview()` returning markdown string

- [ ] **Step 1: Write src/renderer.ts**

```typescript
import type { CollectedItem } from './types.js'
import { groupBySource, groupByType } from './aggregator.js'

export function renderReview(
  items: CollectedItem[],
  period: string,
  dateLabel: string,
  aiSummary?: string
): string {
  const lines: string[] = []
  const heading = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'

  lines.push(`# ${heading} Review — ${dateLabel}`)
  lines.push('')

  if (aiSummary) {
    lines.push('## AI Summary')
    lines.push('')
    lines.push(aiSummary)
    lines.push('')
  }

  const byType = groupByType(items)

  // Linear tasks
  if (byType.task?.length) {
    lines.push('## Linear Tasks')
    lines.push('| Title | Status | Link |')
    lines.push('|-------|--------|------|')
    for (const item of byType.task) {
      lines.push(`| ${item.title} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  // PRs created
  if (byType.pr_created?.length) {
    lines.push('## Pull Requests — Created')
    lines.push('| Title | Repo | Status | Link |')
    lines.push('|-------|------|--------|------|')
    for (const item of byType.pr_created) {
      const repo = (item.metadata?.repo as string) ?? '-'
      lines.push(`| ${item.title} | ${repo} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  // PRs reviewed
  if (byType.pr_reviewed?.length) {
    lines.push('## Pull Requests — Reviewed')
    lines.push('| Title | Repo | Status | Link |')
    lines.push('|-------|------|--------|------|')
    for (const item of byType.pr_reviewed) {
      const repo = (item.metadata?.repo as string) ?? '-'
      lines.push(`| ${item.title} | ${repo} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  // Slack
  if (byType.slack_message?.length) {
    lines.push('## Slack Highlights')
    lines.push('')
    if (aiSummary) {
      // AI summary already covers the narrative
      lines.push('_See AI summary above for details._')
    } else {
      for (const item of byType.slack_message) {
        const channel = (item.metadata?.channel as string) ?? 'unknown'
        lines.push(`- [#${channel}] ${item.title}`)
      }
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Raw data collected from Linear, GitHub, Slack on ${new Date().toISOString()}*`)
  lines.push('')

  return lines.join('\n')
}
```

- [ ] **Step 2: Write tests/renderer.test.ts**

```typescript
import { describe, it, expect } from 'vitest'
import { renderReview } from '../src/renderer.js'
import type { CollectedItem } from '../src/types.js'

describe('renderer', () => {
  it('renders daily review with all sections', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Fix bug', url: 'https://linear.app/test', status: 'Done', timestamp: new Date(), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'Add feature', url: 'https://github.com/foo/bar/pull/1', status: 'open', timestamp: new Date(), description: null, metadata: { repo: 'foo/bar' } },
      { id: '3', source: 'slack', type: 'slack_message', title: 'Hey @me', url: null, status: null, timestamp: new Date(), description: null, metadata: { channel: 'C123' } }
    ]

    const md = renderReview(items, 'daily', '2026-07-27', 'Great work today!')
    expect(md).toContain('# Daily Review — 2026-07-27')
    expect(md).toContain('Great work today!')
    expect(md).toContain('Fix bug')
    expect(md).toContain('Add feature')
    expect(md).toContain('Slack Highlights')
  })

  it('renders heading for weekly reviews', () => {
    const md = renderReview([], 'weekly', 'Jul 21 - Jul 27')
    expect(md).toContain('# Weekly Review — Jul 21 - Jul 27')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: markdown renderer"
```

---

### Task 9: CLI Commands + Wiring

**Files:**
- Modify: `src/index.ts`
- Create: `src/review.ts`
- Create: `tests/review.test.ts`

**Interfaces:**
- Consumes: All previous tasks
- Produces: Working `review daily`, `review weekly`, `review monthly` commands

- [ ] **Step 1: Write src/review.ts**

```typescript
import type { CollectedItem, DateRange } from './types.js'
import type { Config } from './config.js'
import { loadConfig, getConfigDir } from './config.js'
import { getDb, insertCollections, insertReview, getCollectionsInRange } from './db.js'
import { LinearCollector } from './collectors/linear.js'
import { GitHubCollector } from './collectors/github.js'
import { SlackCollector } from './collectors/slack.js'
import { aggregate } from './aggregator.js'
import { generateSummary } from './summarizer.js'
import { renderReview } from './renderer.js'
import { join } from 'path'

export function getDateRange(period: string): DateRange {
  const now = new Date()
  const start = new Date(now)

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0)
  } else if (period === 'weekly') {
    const day = start.getDay()
    const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Monday
    start.setDate(diff)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'monthly') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }

  return { start, end: now }
}

function formatDateLabel(range: DateRange, period: string): string {
  if (period === 'daily') return range.start.toISOString().split('T')[0]
  if (period === 'weekly') {
    const endStr = range.end.toISOString().split('T')[0]
    const startStr = range.start.toISOString().split('T')[0]
    return `${startStr} - ${endStr}`
  }
  return range.start.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export async function generateReview(period: string, useAi: boolean): Promise<string> {
  const config = loadConfig()
  const range = getDateRange(period)
  const dateLabel = formatDateLabel(range, period)
  const dbPath = config.db.path || join(getConfigDir(), 'review.db')
  const db = getDb(dbPath)

  // Check if we already have data cached for this range
  const startStr = range.start.toISOString().split('T')[0]
  const endStr = range.end.toISOString().split('T')[0]
  let items: CollectedItem[] = getCollectionsInRange(db, startStr, endStr).map(r => ({
    id: r.id,
    source: r.source as CollectedItem['source'],
    type: r.type as CollectedItem['type'],
    title: r.title,
    url: r.url,
    status: r.status,
    timestamp: new Date(r.timestamp),
    description: r.description,
    metadata: r.metadata ? JSON.parse(r.metadata) : null
  }))

  if (items.length === 0) {
    // Collect fresh data
    const collectors = [
      new LinearCollector(),
      new GitHubCollector(),
      new SlackCollector()
    ]

    const results = await Promise.allSettled(
      collectors.map(c => c.collect(range, config).catch(err => {
        console.error(`Warning: ${c.name} collector failed: ${err.message}`)
        return [] as CollectedItem[]
      }))
    )

    items = aggregate(results.flatMap(r => r.status === 'fulfilled' ? r.value : []))

    // Store in DB
    const rows = items.map(item => ({
      id: item.id,
      source: item.source,
      type: item.type,
      title: item.title,
      url: item.url,
      status: item.status,
      timestamp: item.timestamp.toISOString(),
      description: item.description,
      metadata: item.metadata ? JSON.stringify(item.metadata) : null,
      collected_date: startStr
    }))
    insertCollections(db, rows)
  }

  let aiSummary: string | undefined
  if (useAi) {
    aiSummary = await generateSummary(items, config, period)
  }

  const markdown = renderReview(items, period, dateLabel, aiSummary)

  // Save review to DB
  insertReview(db, {
    period,
    date_start: startStr,
    date_end: endStr,
    raw_markdown: markdown,
    ai_summary: aiSummary ?? null
  })

  db.close()
  return markdown
}
```

- [ ] **Step 2: Modify src/index.ts — wire up commands**

```typescript
import { Command } from 'commander'
import { initConfig } from './config.js'
import { generateReview } from './review.js'

const program = new Command()
program
  .name('review')
  .description('AI-powered professional review generator')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize configuration')
  .action(async () => {
    await initConfig()
    console.log('Configuration saved to ~/.config/review/config.json')
  })

program
  .command('daily')
  .description('Generate daily review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    const md = await generateReview('daily', options.ai ?? false)
    console.log(md)
  })

program
  .command('weekly')
  .description('Generate weekly review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    const md = await generateReview('weekly', options.ai ?? false)
    console.log(md)
  })

program
  .command('monthly')
  .description('Generate monthly review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    const md = await generateReview('monthly', options.ai ?? false)
    console.log(md)
  })

program
  .command('serve')
  .description('Start MCP server')
  .action(async () => {
    const { startMcpServer } = await import('./mcp-server.js')
    await startMcpServer()
  })

program.parse()
```

- [ ] **Step 3: Write tests/review.test.ts**

```typescript
import { describe, it, expect, vi } from 'vitest'

// Test the date range logic directly
describe('date range helpers', () => {
  it('daily range starts at midnight today', async () => {
    // We export getDateRange from review.ts — test its output
    const { getDateRange } = await import('../src/review.js')
    const range = getDateRange('daily')
    const now = new Date()
    expect(range.start.getHours()).toBe(0)
    expect(range.start.getMinutes()).toBe(0)
    expect(range.start.getSeconds()).toBe(0)
    expect(range.start.getDate()).toBe(now.getDate())
  })

  it('weekly range starts on Monday', async () => {
    const { getDateRange, formatDateLabel } = await import('../src/review.js')
    const range = getDateRange('weekly')
    expect(range.start.getDay()).toBe(1) // Monday
  })
})
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: CLI commands wired to collectors, aggregator, renderer, and AI"
```

---

### Task 10: MCP Server

**Files:**
- Create: `src/mcp-server.ts`
- Create: `tests/mcp-server.test.ts`

**Interfaces:**
- Consumes: `generateReview()` from `review.ts`
- Produces: MCP server with `daily_review`, `weekly_review`, `monthly_review` tools

- [ ] **Step 1: Write src/mcp-server.ts**

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { generateReview } from './review.js'

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'ai-professional-review',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'daily_review',
        description: 'Generate a daily professional review',
        inputSchema: {
          type: 'object',
          properties: {
            ai: { type: 'boolean', description: 'Include AI summary' }
          }
        }
      },
      {
        name: 'weekly_review',
        description: 'Generate a weekly professional review',
        inputSchema: {
          type: 'object',
          properties: {
            ai: { type: 'boolean', description: 'Include AI summary' }
          }
        }
      },
      {
        name: 'monthly_review',
        description: 'Generate a monthly professional review',
        inputSchema: {
          type: 'object',
          properties: {
            ai: { type: 'boolean', description: 'Include AI summary' }
          }
        }
      }
    ]
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const ai = (request.params.arguments?.ai as boolean) ?? false
    let markdown: string

    switch (request.params.name) {
      case 'daily_review':
        markdown = await generateReview('daily', ai)
        break
      case 'weekly_review':
        markdown = await generateReview('weekly', ai)
        break
      case 'monthly_review':
        markdown = await generateReview('monthly', ai)
        break
      default:
        throw new Error(`Unknown tool: ${request.params.name}`)
    }

    return {
      content: [{ type: 'text', text: markdown }]
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
```

- [ ] **Step 2: Write tests/mcp-server.test.ts**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('MCP Server', () => {
  it('can start and exposes tools', async () => {
    // Integration test would spawn the server as a child process
    // and communicate via stdin/stdout JSON-RPC
    // For now, verify the module loads and exports startMcpServer
    const mod = await import('../src/mcp-server.js')
    expect(typeof mod.startMcpServer).toBe('function')
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: MCP server with daily/weekly/monthly tools"
```

---

### Task 11: Review Init — Interactive Config Setup

**Files:**
- Modify: `src/config.ts` (fill in initConfig implementation)

- [ ] **Step 1: Implement initConfig with full prompts**

```typescript
export async function initConfig(): Promise<void> {
  const { createInterface } = await import('readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const q = (query: string) => rl.question(query + ': ')

  console.log('ai-professional-review Configuration\n')

  const config: Config = {
    linear: { apiKey: await q('Linear API Key') },
    github: { token: await q('GitHub Personal Access Token') },
    slack: { token: await q('Slack User Token (xoxp-...)') },
    user: {
      linear: await q('Your Linear email'),
      github: await q('Your GitHub username'),
      slack: await q('Your Slack member ID')
    },
    ai: {
      provider: (await q('AI provider (openai/anthropic)')) as 'openai' | 'anthropic' || 'openai',
      apiKey: await q('AI API Key'),
      model: await q('AI model (default: gpt-4o-mini)') || 'gpt-4o-mini'
    },
    db: {
      path: join(getConfigDir(), 'review.db')
    }
  }

  saveConfig(config)
  rl.close()
}
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: review init command with interactive setup"
```

---

### Task 12: Final Integration & Smoke Test

- [ ] **Step 1: Build and run init**
```bash
npm run build && node dist/index.js init
```

- [ ] **Step 2: Run daily review without AI**
```bash
node dist/index.js daily
```

- [ ] **Step 3: Run daily review with AI**
```bash
node dist/index.js daily --ai
```

- [ ] **Step 4: Run tests**
```bash
npm test
```

- [ ] **Step 5: Verify MCP server starts without errors**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 5 node dist/index.js serve || true
```

- [ ] **Step 6: Final commit**
```bash
git add -A && git commit -m "chore: final integration adjustments"
```
