# Priorities Module Design

## Overview

A `review priorities` CLI command and MCP tool that surfaces actionable
items: Linear tasks needing attention, stale authored PRs, and pending
review requests. Complements the existing retrospective review with a
forward-looking triage view.

## Config

New optional section in existing `~/.config/review/config.json`:

```json
{
  "priorities": {
    "linear": {
      "statuses": ["In Progress", "Todo", "Backlog"]
    },
    "github": {
      "created": {
        "minAgeDays": 14,
        "updatedAfterDays": 7
      },
      "pendingReview": {
        "minAgeDays": 7,
        "updatedAfterDays": 3
      }
    }
  }
}
```

Defaults if the section is absent:
- Linear: `["In Progress", "Todo", "Backlog"]`
- GitHub created: `14` / `7`
- GitHub pending review: `7` / `3`

## Architecture

```
src/priority.ts        # PriorityEngine orchestrator
src/config.ts          # PrioritiesConfig interface + defaults
src/collectors/
  linear.ts            # Already has the SDK client — reuses for priority fetch
  github.ts            # Already has Octokit — reuses for stale/review PRs
```

No new collectors. The PriorityEngine calls the same API clients with
different filters, then assembles into a markdown output.

## CLI

```
review priorities [--ai]
```

- `--ai` generates a brief AI narrative recommending what to work on first.

## MCP Tool

Exposed as `review_priorities` with optional `ai` boolean parameter.

## Data Flow

1. Load config from `~/.config/review/config.json`
2. Read `priorities` section (fall back to defaults)
3. Fetch Linear tasks assigned to user via existing `LinearClient`
4. Filter by configured statuses, sort by `updatedAt` ascending (oldest first)
5. Fetch authored PRs via GitHub search (`author:username`)
6. Filter by age (createdAt older than minAgeDays) and staleness (last update before updatedAfterDays)
7. Fetch PRs awaiting review via GitHub search (`review-requested:username`)
8. Filter same as step 6
9. Render markdown with three tables: Linear, Stale PRs, Pending Reviews
10. If `--ai`, pipe items through LLM for a "what to do" summary

## CLI Output

```markdown
# Priorities — 2026-07-28

## Linear Tasks
| Title | Status | Updated | Link |
|-------|--------|---------|------|

## Stale PRs (Created)
| Title | Age | Updated | Link |
|-------|-----|---------|------|

## PRs Awaiting Your Review
| Title | Age | Author | Link |
|-------|-----|--------|------|
```

## Error Handling

- Same pattern as reviews: each source runs independently
- Missing `priorities` config → use defaults
- Missing API keys → warning, skip that source
- Max 50 results per source (prevent overload)

## Non-Goals

- No real-time notifications
- No email/Slack/Linear integration to nag about stale items
- No automatic status transitions
