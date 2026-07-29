# Cross-Reference Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cross-reference Slack messages and GitHub PRs with Linear tasks in the review report.

**Architecture:** New `src/crossref.ts` module extracts Linear IDs from Slack/PR text and returns typed relationships. `renderer.ts` uses them to add a "Related" column to the Linear Tasks table and a per-task timeline narrative (when `--ai`).

**Tech Stack:** TypeScript, Vitest

## Global Constraints

- All new functions must be exported and pure where possible
- Tests must use `vi.mock` for external SDKs and `await import()` for late binding
- Linear ID regex pattern: `/[A-Z]{2,4}-\d+/g` (matches `ENG-1234`, `LIN-42`, etc.)
- `CrossRef.relationType` values: `'mentioned_in'` | `'implements'`

---

### Task 1: Add CrossRef type

**Files:**
- Modify: `src/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `CrossRef` interface

- [ ] **Step 1: Add CrossRef to types.ts**

Open `src/types.ts` and add after the `DateRange` interface:

```typescript
export interface CrossRef {
  sourceItemId: string
  targetItemId: string
  relationType: 'mentioned_in' | 'implements'
  context: string
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add CrossRef interface for cross-referencing items"
```

---

### Task 2: Implement crossref.ts

**Files:**
- Create: `src/crossref.ts`
- Create: `tests/crossref.test.ts`
- Modify: (implicit — other tests import types)

**Interfaces:**
- Consumes: `CollectedItem` from `src/types.ts`, `CrossRef` from `src/types.ts`
- Produces: `crossReference(items: CollectedItem[]): CrossRef[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/crossref.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import type { CollectedItem, CrossRef } from '../src/types.js'

describe('crossReference', () => {
  it('returns mentioned_in when slack message contains linear issue ID', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'slack-c123',
        source: 'slack',
        type: 'slack_message',
        title: 'Hey, check ENG-1234 in production',
        url: null,
        status: null,
        timestamp: new Date(),
        description: 'Hey, check ENG-1234 in production',
        metadata: { channel: 'eng' }
      },
      {
        id: 'linear-issue-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test issue',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toHaveLength(1)
    expect(result[0].sourceItemId).toBe('slack-c123')
    expect(result[0].targetItemId).toBe('linear-issue-uuid')
    expect(result[0].relationType).toBe('mentioned_in')
  })

  it('returns implements when PR title contains linear issue ID', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'gh-pr-42',
        source: 'github',
        type: 'pr_created',
        title: 'ENG-1234 Fix token minting',
        url: 'https://github.com/org/repo/pull/42',
        status: 'open',
        timestamp: new Date(),
        description: null,
        metadata: { repo: 'org/repo' }
      },
      {
        id: 'linear-issue-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test issue',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toHaveLength(1)
    expect(result[0].sourceItemId).toBe('gh-pr-42')
    expect(result[0].targetItemId).toBe('linear-issue-uuid')
    expect(result[0].relationType).toBe('implements')
  })

  it('returns empty array when no matches found', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'slack-c1',
        source: 'slack',
        type: 'slack_message',
        title: 'Random chat',
        url: null,
        status: null,
        timestamp: new Date(),
        description: null,
        metadata: null
      },
      {
        id: 'linear-issue-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test issue',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toEqual([])
  })

  it('is case-insensitive when matching linear IDs', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'slack-c1',
        source: 'slack',
        type: 'slack_message',
        title: 'check eng-1234 is done',
        url: null,
        status: null,
        timestamp: new Date(),
        description: null,
        metadata: null
      },
      {
        id: 'linear-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/crossref.test.ts`
Expected: FAIL — `crossReference` not exported

- [ ] **Step 3: Write the minimal implementation**

Create `src/crossref.ts`:

```typescript
import type { CollectedItem, CrossRef } from './types.js'

const LINEAR_ID_RE = /[A-Za-z]{2,4}-\d+/g

export function crossReference(items: CollectedItem[]): CrossRef[] {
  const linearItems = items.filter(i => i.source === 'linear')
  const crossRefs: CrossRef[] = []

  for (const item of items) {
    if (item.source === 'linear') continue

    const textToSearch = [item.title, item.description ?? ''].join(' ')
    const foundIds = [...new Set(
      (textToSearch.match(LINEAR_ID_RE) ?? []).map(id => id.toUpperCase())
    )]

    if (foundIds.length === 0) continue

    const matchedLinear = linearItems.filter(li => {
      const liId = (li.metadata?.identifier as string ?? '').toUpperCase()
      return foundIds.includes(liId)
    })

    for (const ml of matchedLinear) {
      crossRefs.push({
        sourceItemId: item.id,
        targetItemId: ml.id,
        relationType: item.source === 'github' ? 'implements' : 'mentioned_in',
        context: textToSearch.slice(0, 200)
      })
    }
  }

  return crossRefs
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/crossref.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/crossref.ts tests/crossref.test.ts
git commit -m "feat: add crossReference module to link Slack/PRs with Linear tasks"
```

---

### Task 3: Wire cross-refs through review.ts

**Files:**
- Modify: `src/review.ts`

**Interfaces:**
- Consumes: `crossReference` from `src/crossref.ts`
- Modifies: `generateReview` — calls crossReference and passes to renderer

- [ ] **Step 1: Write failing test**

Add to `tests/review.test.ts`:

```typescript
it('computes cross-references and passes them to renderer', async () => {
  const { mockClose } = vi.hoisted(() => ({ mockClose: vi.fn() }))

  vi.mock('../src/config.js', () => ({
    loadConfig: () => ({
      linear: { apiKey: 'test' },
      github: { token: 'test' },
      slack: { token: 'test' },
      user: { linear: 'me', github: 'me', slack: 'me' },
      ai: { provider: 'openai', apiKey: 'test', model: 'gpt-4o-mini' },
      db: { path: ':memory:' }
    }),
    getConfigDir: () => '/tmp'
  }))

  vi.mock('../src/db.js', () => ({
    getDb: () => ({ close: mockClose, pragma: vi.fn(), exec: vi.fn() }),
    insertCollections: vi.fn(),
    insertReview: vi.fn()
  }))

  const mockRenderReview = vi.fn(() => '# Review')
  vi.mock('../src/renderer.js', () => ({
    renderReview: mockRenderReview
  }))

  vi.mock('../src/aggregator.js', () => ({
    aggregate: vi.fn((items: any) => items)
  }))

  vi.mock('../src/collectors/linear.js', () => ({
    LinearCollector: vi.fn(() => ({
      name: 'linear',
      collect: vi.fn().mockResolvedValue([{
        id: 'linear-1', source: 'linear', type: 'task',
        title: 'Test', url: null, status: 'Done',
        timestamp: new Date('2026-07-29'), description: null,
        metadata: { identifier: 'ENG-1' }
      }])
    }))
  }))

  vi.mock('../src/collectors/github.js', () => ({
    GitHubCollector: vi.fn(() => ({
      name: 'github',
      collect: vi.fn().mockResolvedValue([{
        id: 'gh-1', source: 'github', type: 'pr_created',
        title: 'ENG-1 fix', url: null, status: 'open',
        timestamp: new Date('2026-07-29'), description: null,
        metadata: { repo: 'org/repo' }
      }])
    }))
  }))

  vi.mock('../src/collectors/slack.js', () => ({
    SlackCollector: vi.fn(() => ({
      name: 'slack',
      collect: vi.fn().mockResolvedValue([])
    }))
  }))

  const { generateReview } = await import('../src/review.js')
  await generateReview('daily', false)

  const crossRefsArg = mockRenderReview.mock.calls[0][5]
  expect(crossRefsArg).toBeDefined()
  expect(crossRefsArg).toHaveLength(1)
  expect(crossRefsArg[0].relationType).toBe('implements')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/review.test.ts -t "computes cross-references"`
Expected: FAIL — `renderReview` called with wrong args

- [ ] **Step 3: Update generateReview to compute cross-references**

In `src/review.ts`:
- Import `{ crossReference } from './crossref.js'`
- After `collectFresh`, add:

```typescript
import { crossReference } from './crossref.js'

// After const { items, warnings } = await collectFresh(collectors, range, config)
const crossRefs = crossReference(items)
```

- Change `renderReview` call to pass `crossRefs` as 6th argument:

```typescript
const markdown = renderReview(items, period, dateLabel, aiSummary, warnings, crossRefs)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/review.test.ts -t "computes cross-references"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/review.ts tests/review.test.ts
git commit -m "feat: wire crossReference into review pipeline"
```

---

### Task 4: Related column in renderer

**Files:**
- Modify: `src/renderer.ts`
- Modify: (existing renderer tests)

**Interfaces:**
- Consumes: `CrossRef[]` as 6th param of `renderReview`
- Produces: updated markdown with "Related" column in Linear Tasks table

- [ ] **Step 1: Write failing test**

Add to `tests/renderer.test.ts`:

```typescript
it('adds Related column when cross-references exist', async () => {
  const { renderReview } = await import('../src/renderer.js')
  const crossRefs = [
    {
      sourceItemId: 'slack-c1',
      targetItemId: 'linear-1',
      relationType: 'mentioned_in' as const,
      context: 'check ENG-1'
    },
    {
      sourceItemId: 'gh-1',
      targetItemId: 'linear-1',
      relationType: 'implements' as const,
      context: 'ENG-1 fix'
    }
  ]
  const items = [
    {
      id: 'linear-1', source: 'linear', type: 'task',
      title: 'Test', url: null, status: 'Done',
      timestamp: new Date(), description: null,
      metadata: { identifier: 'ENG-1' }
    }
  ]
  const result = renderReview(items, 'daily', '2026-07-29', undefined, [], crossRefs)
  expect(result).toContain('Related')
  expect(result).toContain('mentioned_in')
  expect(result).toContain('implements')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/renderer.test.ts -t "adds Related column"`
Expected: FAIL — too few args to renderReview

- [ ] **Step 3: Update renderReview signature and logic**

In `src/renderer.ts`, update function signature:

```typescript
export function renderReview(
  items: CollectedItem[],
  period: string,
  dateLabel: string,
  aiSummary?: string,
  warnings?: string[],
  crossRefs: CrossRef[] = []
): string {
```

Import `CrossRef` at top:

```typescript
import type { CrossRef } from './types.js'
```

Change the Linear Tasks table block to add a Related column. Replace:

```typescript
if (byType.task?.length) {
    lines.push('## Linear Tasks')
    lines.push('| Title | Status | Link |')
    lines.push('|-------|--------|------|')
    for (const item of byType.task) {
      lines.push(`| ${item.title} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }
```

With:

```typescript
if (byType.task?.length) {
    lines.push('## Linear Tasks')
    lines.push('| Title | Status | Related | Link |')
    lines.push('|-------|--------|---------|------|')
    for (const item of byType.task) {
      const related = crossRefs
        .filter(cr => cr.targetItemId === item.id)
        .map(cr => {
          if (cr.relationType === 'mentioned_in') return '💬 slack'
          if (cr.relationType === 'implements') return '🔀 pr'
          return cr.relationType
        })
        .join(', ') || '-'
      lines.push(`| ${item.title} | ${item.status ?? '-'} | ${related} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/renderer.test.ts -t "adds Related column"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer.ts tests/renderer.test.ts
git commit -m "feat: add Related column to Linear Tasks table"
```

---

### Task 5: Task Narratives section (when --ai)

**Files:**
- Modify: `src/renderer.ts`

**Interfaces:**
- Consumes: `CrossRef[]` (already piped), `aiSummary` being present triggers narratives
- Produces: per-task timeline section in markdown output

- [ ] **Step 1: Write failing test**

Add to `tests/renderer.test.ts`:

```typescript
it('renders task narratives when aiSummary is present', async () => {
  const { renderReview } = await import('../src/renderer.js')
  const now = new Date('2026-07-29T12:00:00Z')
  const crossRefs = [
    {
      sourceItemId: 'slack-c1',
      targetItemId: 'linear-1',
      relationType: 'mentioned_in' as const,
      context: 'discussed in #eng'
    },
    {
      sourceItemId: 'gh-1',
      targetItemId: 'linear-1',
      relationType: 'implements' as const,
      context: 'PR #42'
    }
  ]
  const items = [
    {
      id: 'linear-1', source: 'linear', type: 'task',
      title: 'Test ENG-1', url: null, status: 'Done',
      timestamp: new Date('2026-07-28T10:00:00Z'), description: null,
      metadata: { identifier: 'ENG-1' }
    },
    {
      id: 'gh-1', source: 'github', type: 'pr_created',
      title: 'ENG-1 fix', url: null, status: 'merged',
      timestamp: new Date('2026-07-29T08:00:00Z'), description: null,
      metadata: { repo: 'org/repo' }
    },
    {
      id: 'slack-c1', source: 'slack', type: 'slack_message',
      title: 'discussed in #eng', url: null, status: null,
      timestamp: new Date('2026-07-29T09:00:00Z'), description: null,
      metadata: { channel: 'eng' }
    }
  ]
  const result = renderReview(items, 'daily', '2026-07-29', 'AI summary here', [], crossRefs)
  expect(result).toContain('## Task Narratives')
  expect(result).toContain('Test ENG-1')
  expect(result).toContain('Jul 29')
  expect(result).toContain('PR #42')
})

it('skips task narratives when aiSummary is absent', async () => {
  const { renderReview } = await import('../src/renderer.js')
  const items = [
    {
      id: 'linear-1', source: 'linear', type: 'task',
      title: 'Test', url: null, status: 'Done',
      timestamp: new Date(), description: null,
      metadata: { identifier: 'ENG-1' }
    }
  ]
  const result = renderReview(items, 'daily', '2026-07-29', undefined, [], [])
  expect(result).not.toContain('## Task Narratives')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/renderer.test.ts -t "task narratives"`
Expected: FAIL — no narratives section yet

- [ ] **Step 3: Implement narratives section**

In `src/renderer.ts`, after the AI Summary block and before the Linear Tasks table, add:

```typescript
if (aiSummary && crossRefs.length > 0) {
    const linearItems = items.filter(i => i.source === 'linear')
    const hasNarratives = linearItems.some(li =>
      crossRefs.some(cr => cr.targetItemId === li.id)
    )

    if (hasNarratives) {
      lines.push('## Task Narratives')
      lines.push('')

      for (const li of linearItems) {
        const liCrossRefs = crossRefs.filter(cr => cr.targetItemId === li.id)
        if (liCrossRefs.length === 0) continue

        const identifier = (li.metadata?.identifier as string) ?? li.id
        lines.push(`### ${identifier} — ${li.title}`)
        lines.push('')

        // Task created event
        const createdDate = li.timestamp.toISOString().split('T')[0]
        const createdLabel = new Date(li.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        lines.push(`- **${createdLabel}** — 🎯 Task created`)

        // Gather related source items sorted by timestamp
        const relatedItems = items.filter(i =>
          liCrossRefs.some(cr => cr.sourceItemId === i.id)
        ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

        for (const ri of relatedItems) {
          const dateLabel = ri.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          if (ri.source === 'github') {
            const repo = (ri.metadata?.repo as string) ?? ''
            lines.push(`- **${dateLabel}** — 🔀 PR opened (${repo})`)
          } else if (ri.source === 'slack') {
            const channel = (ri.metadata?.channel as string) ?? 'channel'
            lines.push(`- **${dateLabel}** — 💬 Discussed in #${channel}`)
          }
        }

        // Status event
        const statusLabel = li.status ?? 'completed'
        lines.push(`- **${createdLabel}** — ✅ ${statusLabel}`)
        lines.push('')
      }
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/renderer.test.ts -t "task narratives"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/renderer.ts tests/renderer.test.ts
git commit -m "feat: add Task Narratives section with per-task timeline"
```
