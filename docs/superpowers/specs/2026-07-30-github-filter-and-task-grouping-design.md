# GitHub Repo Filtering + Grouped Task Display

## Problem

1. The GitHub collector fetches PRs from all repos, mixing personal repos (e.g. `personal-auto-report`) with work repos. No way to scope to specific orgs/repos.
2. Linear tasks are shown in a single flat table. No grouping by project or team makes it hard to see what happened in each area.
3. The AI summary narrates activity linearly without thematic grouping.

## Solution

### GitHub Repo Filtering

Add `github.filter` to config with `includeRepos` and `excludeRepos` arrays.
Pattern matching supports exact names (`courtyard/checkout`) and org globs (`courtyard/*`).
Filtering happens in `github.ts` after search results return.

### Grouped Task Display

Add `display.groupBy` to config: `'project'` | `'team'` | `'none'` (default `'none'`).

When `groupBy` is `team` or `project`, the Linear Tasks section renders sub-sections
by group instead of a single table. Each group has its own table header.

The Linear collector already stores `metadata.team`. For project grouping,
the collector must also fetch `issue.project` and store `metadata.project`.

### AI Thematic Grouping

When `--ai` is passed, the summarizer prompt changes to ask the LLM to group
by theme. No structural change to the output — the AI Summary section already
exists and the new prompt produces the desired grouping.

## Config Changes

```typescript
// In Config interface
github: {
  token: string
  filter?: {
    includeRepos?: string[]
    excludeRepos?: string[]
  }
}
display?: {
  groupBy?: 'project' | 'team' | 'none'
}
```

Defaults:
- `includeRepos`: not set — no filtering
- `excludeRepos`: not set — no filtering
- `groupBy`: `'none'` — flat table, current behavior

## Changes

### src/config.ts

Add `GitHubFilterConfig` and `DisplayConfig` interfaces, merge into `Config`.
Update `getPrioritiesConfig` pattern if needed or add a similar helper.

### src/collectors/github.ts

After PR search results, filter against `includeRepos`/`excludeRepos`:

```typescript
function repoMatches(repo: string, pattern: string): boolean {
  if (pattern.endsWith('/*')) {
    const org = pattern.slice(0, -2)
    return repo.startsWith(org + '/')
  }
  return repo === pattern
}
```

Applied per-item before pushing to the items array.

### src/collectors/linear.ts

Add project fetching alongside team:

```typescript
const [state, team, project] = await Promise.all([
  issue.state, issue.team, issue.project
])
```

Store `metadata.project` as `project?.name ?? null`.

### src/renderer.ts

When `groupBy !== 'none'`, group `byType.task` items by `metadata.team` or
`metadata.project`. Render each group as a sub-section:

```markdown
### Engineering
| Title | Status | Related | Link |
```

If `groupBy` is `'none'`, render the current single table.

### src/summarizer.ts

Update the default prompt template to include thematic grouping instructions.
When items span multiple groups, ask the LLM to organize by theme.

## Testing

### tests/collectors/github.test.ts
- `repoMatches` with exact match, org glob, no match
- Filtering with `includeRepos`, `excludeRepos`, both

### tests/renderer.test.ts
- `groupBy: 'team'` renders team sub-sections
- `groupBy: 'project'` renders project sub-sections
- `groupBy: 'none'` renders flat table (existing behavior)
- Missing `display` config uses default `'none'`

### tests/summarizer.test.ts
- Prompt includes thematic grouping language when items exist

## Files Changed

| File | Change |
|------|--------|
| `src/config.ts` | Add `GitHubFilterConfig`, `DisplayConfig`, update `Config` interface |
| `src/collectors/github.ts` | Add `repoMatches()`, filter after search |
| `src/collectors/linear.ts` | Fetch `issue.project`, store in metadata |
| `src/renderer.ts` | Group Linear Tasks by team/project when configured |
| `src/summarizer.ts` | Update default prompt for thematic grouping |
| `tests/collectors/github.test.ts` | Add filter tests |
| `tests/renderer.test.ts` | Add group display tests |
| `tests/summarizer.test.ts` | Add prompt tests |
