# ai-professional-review

CLI + MCP server that generates daily, weekly, and monthly professional
reviews from Linear tasks, GitHub PRs, and Slack messages. Optionally
produces AI-powered narrative summaries via OpenAI or DeepSeek.

## Quick Start

```bash
npm install && npm run build
node dist/index.js init     # interactive setup
node dist/index.js daily    # today's review
node dist/index.js daily --ai  # with AI summary
```

## Prerequisites

- **Node 20+**
- **Linear API key** — `linear.app/settings/api`
- **GitHub PAT** — `github.com/settings/tokens` (scope: `repo`)
- **Slack user token** — `api.slack.com/apps` (scopes: `channels:history`,
  `channels:read`, `users:read`, `groups:history`; token type: User OAuth,
  `xoxp-...`)
- **OpenAI or DeepSeek API key**

Slack is optional — the tool works with just Linear and GitHub.

## Configuration

Config is stored at `~/.config/review/config.json` (0600 permissions).

### AI Providers

| Provider | Model (default) | Notes |
|----------|-----------------|-------|
| `openai` | `gpt-4o-mini` | Standard OpenAI |
| `deepseek` | `deepseek-chat` | Uses `https://api.deepseek.com` |

Custom `baseUrl` field supports any OpenAI-compatible API.

### Custom Prompt

Add a `prompt` field to the `ai` config to customize the AI summary
instructions. Use `{period}` and `{sections}` as placeholders:

```json
{
  "ai": {
    "provider": "openai",
    "apiKey": "sk-...",
    "model": "gpt-4o-mini",
    "prompt": "Summarize my {period} work in a very casual tone:\n{sections}"
  }
}
```

## CLI Usage

```bash
# Reviews (defaults to today/this week/this month)
node dist/index.js daily [--ai]
node dist/index.js weekly [--ai]
node dist/index.js monthly [--ai]

# Custom date range (capped at 7 days)
node dist/index.js daily --from 2026-07-27 --to 2026-07-27 --ai
node dist/index.js daily --from "2026-07-27T14:00:00" --ai

# Setup
node dist/index.js init

# MCP server (stdio)
node dist/index.js serve
```

## MCP Server

`review serve` starts an MCP server on stdio transport exposing tools:

- `daily_review(ai?, from?, to?)`
- `weekly_review(ai?, from?, to?)`
- `monthly_review(ai?, from?, to?)`

Configure in OpenCode or any MCP client:

```json
{
  "mcpServers": {
    "ai-professional-review": {
      "command": "node",
      "args": ["/path/to/ai-professional-review/dist/index.js", "serve"]
    }
  }
}
```

## Output

```markdown
# Daily Review — 2026-07-28

## AI Summary
_[2-4 paragraph narrative, only with --ai flag]_

## Linear Tasks
| Title | Status | Link |

## Pull Requests — Created
| Title | Repo | Status | Link |

## Pull Requests — Reviewed
| Title | Repo | Status | Link |

## Slack Highlights
_[AI-summarized relevant messages]_

## Warnings
_[Collector failures, if any]_
```

## Architecture

```
src/
  index.ts         CLI entry
  cli.ts           Async CLI runner
  config.ts        Config loading/saving/validation
  db.ts            SQLite schema + queries
  types.ts         Data types
  collector.ts     Collector interface
  collectors/      Data source implementations
    linear.ts      Linear SDK → tasks
    github.ts      Octokit → PRs created/reviewed
    slack.ts       @slack/web-api → @mentions
  aggregator.ts    Merge + sort items
  summarizer.ts    AI narrative (OpenAI/DeepSeek)
  renderer.ts      Markdown output
  review.ts        Orchestration pipeline
  mcp-server.ts    MCP stdio server
```

## Development

```bash
npm test           # vitest (mock all APIs)
npm run typecheck  # tsc --noEmit
npm run build      # tsup --platform node
```

## Known Limitations (v1)

- **Slack pagination** — only fetches first page of messages and first 10
  channels. Slack data may be incomplete for heavy-channel workspaces.
- **GitHub reviews** — review timestamps come from the Reviews API, which
  covers submitted reviews. Inline review comments without an approval/
  changes-requested state may not be picked up.
- **AI provider** — only OpenAI and DeepSeek (OpenAI-compatible) are
  supported. Anthropic requires a code change.
- **Single-user** — the tool is designed for one person's review.
