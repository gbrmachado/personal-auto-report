# ai-professional-review Design Spec

## Overview

`ai-professional-review` is a CLI tool that generates daily, weekly, and monthly professional reviews as markdown. It aggregates data from Linear, GitHub, and Slack, optionally generates AI-powered summaries, and stores historical data in SQLite for cross-period analysis. The tool runs as both a CLI and an MCP server.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ai-professional-review                    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Linear   │  │ GitHub   │  │ Slack    │                 │
│  │ Collector│  │ Collector│  │ Collector│                 │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
│       │             │             │                        │
│       ▼             ▼             ▼                        │
│  ┌─────────────────────────────────────┐                  │
│  │         Review Aggregator           │                  │
│  │  (merge + sort into timeline)       │                  │
│  └────────────┬────────────────────────┘                  │
│               │                                           │
│        ┌──────▼──────┐                                   │
│        │  LLM        │  optional AI summary              │
│        │  Summarizer │                                   │
│        └──────┬──────┘                                   │
│               │                                           │
│               ▼                                           │
│  ┌──────────────────────┐                                │
│  │  Markdown Renderer   │                                │
│  └──────────────────────┘                                │
│                                                             │
│  Modes: CLI (stdout)  │  MCP Server (stdio transport)      │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### Collector Interface

```typescript
interface Collector {
  name: string
  collect(range: DateRange): Promise<CollectedItem[]>
}

interface CollectedItem {
  id: string
  source: 'linear' | 'github' | 'slack'
  type: 'task' | 'pr_created' | 'pr_reviewed' | 'slack_message'
  title: string
  url: string
  status: string
  timestamp: Date
  description?: string
  metadata?: Record<string, unknown>
}

interface DateRange {
  start: Date
  end: Date
}
```

### SQLite Schema

```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  status TEXT,
  timestamp TEXT NOT NULL,
  description TEXT,
  metadata TEXT,  -- JSON
  collected_date TEXT NOT NULL  -- date this was collected (YYYY-MM-DD)
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL,  -- 'daily' | 'weekly' | 'monthly'
  date_start TEXT NOT NULL,
  date_end TEXT NOT NULL,
  raw_markdown TEXT NOT NULL,
  ai_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_collections_collected_date ON collections(collected_date);
CREATE INDEX idx_reviews_period_date ON reviews(period, date_start);
```

## CLI Interface

```
review init                    # interactive config setup
review daily    [--ai]         # today's review
review weekly   [--ai]         # this week (Mon-Sun)
review monthly  [--ai]         # this month
review serve                   # start MCP server (stdio)
```

## MCP Server

When running `review serve`, the tool starts an MCP server on stdio transport exposing:

- `daily_review(ai?: boolean)` → returns markdown string
- `weekly_review(ai?: boolean)` → returns markdown string
- `monthly_review(ai?: boolean)` → returns markdown string

This allows OpenCode or any MCP client to invoke reviews as tools.

## Markdown Output

```markdown
# Daily Review — 2026-07-27

## AI Summary
_[AI-generated narrative, only if --ai flag]_

## Linear Tasks
| Title | Status | Link |
|-------|--------|------|

## Pull Requests
### Created
| Title | Repo | Status | Link |
### Reviewed
| Title | Repo | Status | Link |

## Slack Highlights
_[AI-summarized relevant messages — decisions, action items, questions]_

---
_Raw data collected from Linear, GitHub, Slack_
```

## Data Sources

### Linear
- Fetch tasks assigned to the configured user
- Filter by updated/created within the date range
- Uses Linear GraphQL API via `@linear/sdk`

### GitHub
- Fetch PRs authored by the configured user
- Fetch PRs reviewed by the configured user
- Uses Octokit (GitHub REST API)

### Slack
- Fetch messages where user was @mentioned
- Fetch messages in threads the user participated in
- Fetch saved items
- Uses `@slack/web-api`

## Configuration

Stored at `~/.config/review/config.json`:

```json
{
  "linear": { "apiKey": "lin_api_..." },
  "github": { "token": "ghp_..." },
  "slack": { "token": "xoxp_..." },
  "user": {
    "linear": "email",
    "github": "username",
    "slack": "member_id"
  },
  "ai": {
    "provider": "openai",
    "apiKey": "sk-...",
    "model": "gpt-4o-mini"
  },
  "db": {
    "path": "~/.config/review/review.db"
  }
}
```

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Bun (preferred for speed + built-in SQLite + bundling)
- **Key dependencies:**
  - `@modelcontextprotocol/sdk` — MCP server
  - `@linear/sdk` — Linear API
  - `octokit` — GitHub API
  - `@slack/web-api` — Slack API
  - `openai` or `@anthropic-ai/sdk` — AI summaries
  - `commander` — CLI framework
  - `better-sqlite3` or `bun:sqlite` — database

## Error Handling

- Each collector runs independently. One failing source doesn't block the review.
- Failed collectors are reported as a warning section in the output.
- Config validation on `review init` and on every run.

## Non-Goals (v1)

- No real-time notifications
- No email/Slack posting (future)
- No web dashboard (future)
- No multi-user support
