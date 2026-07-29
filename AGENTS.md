# AGENTS.md — ai-professional-review

## Project

CLI + MCP server that generates daily/weekly/monthly professional reviews
from Linear, GitHub, and Slack data with optional AI (OpenAI/DeepSeek)
summaries. Outputs markdown, stores history in SQLite.

## Commands

```bash
npm test              # vitest run
npm run build         # tsup src/index.ts --format esm --clean --platform node
npm run typecheck     # tsc --noEmit
npm run dev           # tsup src/index.ts --format esm --watch --platform node

# After build:
node dist/index.js init            # interactive config setup
node dist/index.js daily [--ai]    # today, optional AI summary
node dist/index.js weekly [--ai]   # this week
node dist/index.js monthly [--ai]  # this month
node dist/index.js priorities [--ai] # stale tasks + PRs needing attention
node dist/index.js serve           # MCP server (stdio)
```

`daily --from YYYY-MM-DD --to YYYY-MM-DD` also accepts ISO datetimes. Range capped at 7 days.

## Architecture

```
src/index.ts         CLI entry (commander) — delegates to runCli
src/cli.ts           Async CLI runner (parseAsync + error reporting)
src/config.ts        Config load/save, initConfig, parseAiProvider
src/db.ts            SQLite schema + CRUD (better-sqlite3, WAL pragma)
src/types.ts         CollectedItem, DateRange
src/collector.ts     Collector interface (name + collect method)
src/collectors/
  linear.ts          @linear/sdk → tasks assigned to user
  github.ts          octokit → PRs created/reviewed
  slack.ts           @slack/web-api → @mentions
src/aggregator.ts    Merge + sort by timestamp; groupBySource, groupByType
src/summarizer.ts    OpenAI/DeepSeek LLM summary via OpenAI SDK
src/renderer.ts      Markdown output (sections: AI Summary, Linear Tasks, PRs, Slack, Warnings)
src/priority.ts      PriorityEngine — Linear tasks by status, stale PRs, pending reviews
src/review.ts        Orchestration: collectFresh → aggregate → summarize → render
src/mcp-server.ts    MCP stdio server, 4 tools (daily/weekly/monthly review + priorities)
```

## Testing

- Vitest for all tests. External APIs **never** hit real services — always mock.
- Pattern: `vi.mock` SDK at module level, then `await import()` inside test for late binding.
- `vi.hoisted()` for shared mock values across vi.mock callbacks.
- One test file per source file under `tests/` mirroring `src/` structure.

## Config & Data

- Config: `~/.config/review/config.json` (mode 0600)
- DB: `~/.config/review/review.db` (auto-created with WAL journaling)
- [AI providers](https://github.com/anomalyco/opencode/issues): `openai` (gpt-4o-mini) and `deepseek` (deepseek-chat).
  Custom `baseUrl` supports any OpenAI-compatible API.
- Priorities config controls which Linear statuses and GitHub PR age thresholds appear.

## Conventions

- ESM (`"type": "module"`), TypeScript strict mode, Node 20+ (`.nvmrc`)
- `tsup` bundling with `--platform node` for Node built-ins
- Each collector runs independently (`Promise.allSettled` in `collectFresh`)
- Collectors implement `Collector` interface from `src/collector.ts`
- Tests default: vitest config in `package.json` scripts (no `vitest.config.ts`)
- Capped 7-day range for all custom date queries

## Workflow

- **Never push directly to `main`.** Always create a feature branch, push it, and open a PR.
- After PR approval, merge via GitHub UI (squash or merge commit).
- CI runs on every push and PR via `.github/workflows/ci.yml`.
