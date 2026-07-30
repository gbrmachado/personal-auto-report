# GitHub Filter + Grouped Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add GitHub repo filtering by org/repo and grouped task display by project or team.

**Architecture:** Config-driven — `github.filter` controls which repos appear, `display.groupBy` controls how Linear tasks are grouped in the renderer. The Linear collector fetches project info. The summarizer prompt changes for thematic grouping.

**Tech Stack:** TypeScript, Vitest

## Global Constraints

- `GitHubFilterConfig`: `{ includeRepos?: string[], excludeRepos?: string[] }`
- `DisplayConfig`: `{ groupBy?: 'project' | 'team' | 'none' }`
- Default `groupBy`: `'none'` (flat table, current behavior)
- Repo patterns: exact match (`org/repo`) or org glob (`org/*`)
- Tests use `vi.mock` for external SDKs and `await import()` for late binding

---

### Task 1: Add config types for filter and display

**Files:**
- Modify: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces: `GitHubFilterConfig`, `DisplayConfig`, updated `Config.github` and `Config.display`

- [ ] **Step 1: Write failing test**

Add to `tests/config.test.ts`:

```typescript
it('parses config with github filter and display groupBy', () => {
  const config: Config = {
    linear: { apiKey: 'k' },
    github: { token: 't', filter: { includeRepos: ['org/*'], excludeRepos: ['org/legacy'] } },
    slack: { token: 't' },
    user: { linear: 'a', github: 'b', slack: 'c' },
    ai: { provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' },
    db: { path: ':memory:' },
    display: { groupBy: 'project' }
  }
  expect(config.github.filter?.includeRepos).toEqual(['org/*'])
  expect(config.display?.groupBy).toBe('project')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL — `display` not in `Config` type

- [ ] **Step 3: Add types to config.ts**

In `src/config.ts`, add after `GitHubPriorityConfig`:

```typescript
export interface GitHubFilterConfig {
  includeRepos?: string[]
  excludeRepos?: string[]
}

export interface DisplayConfig {
  groupBy?: 'project' | 'team' | 'none'
}
```

Update `Config.github` to `token: string; filter?: GitHubFilterConfig`.
Add to `Config`: `display?: DisplayConfig`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add GitHubFilterConfig and DisplayConfig types"
```

---

### Task 2: GitHub repo filtering

**Files:**
- Modify: `src/collectors/github.ts`
- Test: `tests/collectors/github.test.ts`

**Interfaces:**
- Consumes: `Config.github.filter` from Task 1
- Produces: `repoMatches(repo: string, pattern: string): boolean`, filtered PR collection

- [ ] **Step 1: Write failing tests**

Add to `tests/collectors/github.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('repoMatches', () => {
  it('matches exact repo name', async () => {
    const { repoMatches } = await import('../../src/collectors/github.js')
    expect(repoMatches('org/repo', 'org/repo')).toBe(true)
    expect(repoMatches('org/repo', 'other/repo')).toBe(false)
  })

  it('matches org glob pattern', async () => {
    const { repoMatches } = await import('../../src/collectors/github.js')
    expect(repoMatches('courtyard/checkout', 'courtyard/*')).toBe(true)
    expect(repoMatches('courtyard/api', 'courtyard/*')).toBe(true)
    expect(repoMatches('other/project', 'courtyard/*')).toBe(false)
  })

  it('filters by includeRepos', async () => {
    const { GitHubCollector } = await import('../../src/collectors/github.js')
    // Mock octokit to return PRs from multiple repos
    // Then verify only included repos appear
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/collectors/github.test.ts`
Expected: FAIL — `repoMatches` not exported

- [ ] **Step 3: Add repoMatches and filter logic**

In `src/collectors/github.ts`, add before the class:

```typescript
export function repoMatches(repo: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    return repo.startsWith(pattern.slice(0, -1))
  }
  return repo === pattern
}
```

In `collect()`, after building a PR item and before pushing, add:

```typescript
const includeRepos = config.github.filter?.includeRepos
const excludeRepos = config.github.filter?.excludeRepos
const repoStr = repoInfo ? `${repoInfo.owner}/${repoInfo.repo}` : null

if (includeRepos && repoStr && !includeRepos.some(p => repoMatches(repoStr, p))) continue
if (excludeRepos && repoStr && excludeRepos.some(p => repoMatches(repoStr, p))) continue
```

Apply this guard before every `items.push()` (3 places: created, reviewed, assigned).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/collectors/github.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/collectors/github.ts tests/collectors/github.test.ts
git commit -m "feat: add repo filtering by includeRepos/excludeRepos"
```

---

### Task 3: Add project field to Linear collector

**Files:**
- Modify: `src/collectors/linear.ts`
- Test: `tests/collectors/linear.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `metadata.project` on Linear `CollectedItem`

- [ ] **Step 1: Write failing test**

In `tests/collectors/linear.test.ts`, update the existing test to expect `metadata.project`:

```typescript
it('returns collected items with project metadata', async () => {
  // ... existing setup ...
  expect(items[0].metadata?.project).toBe('Checkout')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/collectors/linear.test.ts`
Expected: FAIL — `project` is undefined

- [ ] **Step 3: Fetch project in Linear collector**

In `src/collectors/linear.ts`, change the Promise.all:

```typescript
const [state, team, project] = await Promise.all([
  issue.state, issue.team, issue.project
])
```

Add to metadata:

```typescript
metadata: {
  priority: issue.priority,
  team: team?.name ?? null,
  project: project?.name ?? null,
  identifier: issue.identifier
}
```

- [ ] **Step 4: Update mock test data**

In `tests/collectors/linear.test.ts`, update the mock `LinearClient` to return `project: Promise.resolve({ name: 'Checkout' })` on each issue node.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/collectors/linear.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/collectors/linear.ts tests/collectors/linear.test.ts
git commit -m "feat: add project metadata to Linear collector"
```

---

### Task 4: Grouped task display in renderer

**Files:**
- Modify: `src/renderer.ts`
- Test: `tests/renderer.test.ts`

**Interfaces:**
- Consumes: `DisplayConfig.groupBy` (passed as config to renderer — add 7th param or read from items metadata)
- Produces: grouped Linear Tasks sub-sections

- [ ] **Step 1: Write failing tests**

Add to `tests/renderer.test.ts`:

```typescript
it('groups tasks by team when groupBy is team', async () => {
  const { renderReview } = await import('../src/renderer.js')
  const items = [
    { id: 'l1', source: 'linear', type: 'task', title: 'Fix A', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { team: 'Eng', identifier: 'ENG-1' } },
    { id: 'l2', source: 'linear', type: 'task', title: 'Fix B', url: null, status: 'Todo', timestamp: new Date(), description: null, metadata: { team: 'Eng', identifier: 'ENG-2' } },
    { id: 'l3', source: 'linear', type: 'task', title: 'Design C', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { team: 'Design', identifier: 'DSG-1' } }
  ]
  const result = renderReview(items, 'daily', '2026-07-30', undefined, [], [], 'team')
  expect(result).toContain('### Eng')
  expect(result).toContain('### Design')
  expect(result).toContain('Fix A')
  expect(result).toContain('Design C')
})

it('falls back to flat table when groupBy is none', async () => {
  const { renderReview } = await import('../src/renderer.js')
  const items = [
    { id: 'l1', source: 'linear', type: 'task', title: 'Task A', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { team: 'Eng' } }
  ]
  const result = renderReview(items, 'daily', '2026-07-30', undefined, [], [], 'none')
  expect(result).not.toContain('### Eng')
  expect(result).toContain('## Linear Tasks')
  expect(result).toContain('| Title | Status | Related | Link |')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/renderer.test.ts -t "groups tasks|flat table"`
Expected: FAIL — renderReview doesn't accept 7th param

- [ ] **Step 3: Add groupBy to renderer signature**

Change `renderReview` to accept optional 7th param `groupBy?: string` (default `'none'`):

```typescript
export function renderReview(
  items: CollectedItem[],
  period: string,
  dateLabel: string,
  aiSummary?: string,
  warnings?: string[],
  crossRefs: CrossRef[] = [],
  groupBy: string = 'none'
): string {
```

Replace the Linear Tasks table block. When `groupBy !== 'none'`, group `byType.task` by `item.metadata?.team` (or `item.metadata?.project`), render each group as:

```typescript
if (byType.task?.length) {
    lines.push('## Linear Tasks')
    lines.push('')

    if (groupBy !== 'none') {
      const groups = new Map<string, CollectedItem[]>()
      for (const item of byType.task) {
        const key = String(item.metadata?.[groupBy as keyof typeof item.metadata] ?? 'Other')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      }
      for (const [groupName, groupItems] of groups) {
        lines.push(`### ${groupName}`)
        lines.push('| Title | Status | Related | Link |')
        lines.push('|-------|--------|---------|------|')
        for (const item of groupItems) {
          const related = crossRefs
            .filter(cr => cr.targetItemId === item.id)
            .map(cr => cr.relationType === 'mentioned_in' ? '💬 slack' : '🔀 pr')
            .join(', ') || '-'
          lines.push(`| ${item.title} | ${item.status ?? '-'} | ${related} | ${item.url ?? '-'} |`)
        }
        lines.push('')
      }
    } else {
      lines.push('| Title | Status | Related | Link |')
      lines.push('|-------|--------|---------|------|')
      for (const item of byType.task) {
        const related = crossRefs
          .filter(cr => cr.targetItemId === item.id)
          .map(cr => cr.relationType === 'mentioned_in' ? '💬 slack' : '🔀 pr')
          .join(', ') || '-'
        lines.push(`| ${item.title} | ${item.status ?? '-'} | ${related} | ${item.url ?? '-'} |`)
      }
      lines.push('')
    }
  }
```

- [ ] **Step 4: Wire groupBy through review.ts**

In `src/review.ts`, read the config and pass it to `renderReview`:

```typescript
const groupBy = config.display?.groupBy ?? 'none'
const markdown = renderReview(items, period, dateLabel, aiSummary, warnings, crossRefs, groupBy)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/renderer.test.ts -t "groups tasks|flat table"`
Expected: PASS

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/renderer.ts src/review.ts tests/renderer.test.ts
git commit -m "feat: group Linear Tasks by team/project in renderer"
```

---

### Task 5: AI thematic grouping prompt

**Files:**
- Modify: `src/summarizer.ts`
- Test: `tests/summarizer.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: updated `buildPrompt` with thematic grouping instruction

- [ ] **Step 1: Write failing test**

Add to `tests/summarizer.test.ts`:

```typescript
it('prompt includes thematic grouping instruction', async () => {
  const { buildPrompt } = await import('../src/summarizer.js')
  const items = [{ id: '1', source: 'linear', type: 'task', title: 'Fix bug', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }]
  const prompt = buildPrompt(items, 'daily')
  expect(prompt).toContain('thematic')
  expect(prompt).toContain('group')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/summarizer.test.ts -t "thematic"`
Expected: FAIL — prompt doesn't contain "thematic"

- [ ] **Step 3: Update the default prompt**

In `src/summarizer.ts`, update the `buildPrompt` default template:

Replace the "Focus on:" lines with:

```
Focus on:
- What was accomplished
- Decisions made
- Action items / follow-ups
- Group related items by theme or project area
```

And update the instruction:

```
Keep it concise (2-4 paragraphs). Group related tasks and PRs thematically
rather than listing chronologically. Do not use bullet points.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/summarizer.test.ts -t "thematic"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/summarizer.ts tests/summarizer.test.ts
git commit -m "feat: add thematic grouping instruction to AI prompt"
```
