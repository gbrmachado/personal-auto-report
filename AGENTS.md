# AGENTS.md — ai-professional-review

## Project

CLI + MCP server that generates daily/weekly/monthly professional reviews
from Linear, GitHub, and Slack data with optional AI (OpenAI/DeepSeek)
summaries. Outputs markdown, stores history in SQLite.

## Commands

```bash
npm test              # vitest run
npm run build          # tsup --platform node
npm run typecheck      # tsc --noEmit
npm run dev            # tsup --watch

# After build:
node dist/index.js init          # interactive config setup
node dist/index.js daily --ai    # today's review with AI summary
node dist/index.js weekly --ai   # this week's review
node dist/index.js monthly --ai  # this month's review
node dist/index.js serve         # MCP server (stdio)
```

## Architecture

```
src/index.ts         CLI entry — delegates to runCli
src/cli.ts           Async CLI runner (parseAsync + error reporting)
src/config.ts        Config loading/saving, initConfig, parseAiProvider
src/db.ts            SQLite schema + CRUD (better-sqlite3)
src/types.ts         CollectedItem, DateRange
src/collector.ts     Collector interface (Config-typed)
src/collectors/
  linear.ts          Linear SDK → tasks
  github.ts          Octokit → PRs created/reviewed
  slack.ts           @slack/web-api → @mentions
src/aggregator.ts    Merge + sort items
src/summarizer.ts    OpenAI/DeepSeek LLM summary
src/renderer.ts      Markdown output
src/review.ts        Orchestration: collectFresh → aggregate → summarize → render
src/mcp-server.ts    MCP server (stdio transport), executeReviewTool
```

## Conventions

- Node 20+, ESM modules, TypeScript strict mode
- Config at `~/.config/review/config.json` (0600)
- DB at `~/.config/review/review.db`
- Vitest for testing — mock all external APIs (never hit real services)
- tsup for bundling — use `--platform node` for Node built-ins
- `.nvmrc` for Node version (works with nvm, fnm, mise)
- Collectors implement `Collector` interface from `src/collector.ts`
- Each collector runs independently — one failure doesn't block others
- TDD: write test first, watch it fail, implement, verify pass

## AI Providers

Supported: `openai`, `deepseek`. DeepSeek defaults to `deepseek-chat` model
and `https://api.deepseek.com` base URL. Both use the OpenAI SDK.
Custom `baseUrl` in config supports any OpenAI-compatible API.
