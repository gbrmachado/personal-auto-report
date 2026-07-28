#!/usr/bin/env node
import { Command } from 'commander'
import { initConfig } from './config.js'
import { generateReview } from './review.js'
import { runCli } from './cli.js'

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
  .option('--from <date>', 'Date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    const md = await generateReview('daily', options.ai ?? false, options.from, options.to)
    console.log(md)
  })

program
  .command('weekly')
  .description('Generate weekly review')
  .option('--ai', 'Include AI summary')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    const md = await generateReview('weekly', options.ai ?? false, options.from, options.to)
    console.log(md)
  })

program
  .command('monthly')
  .description('Generate monthly review')
  .option('--ai', 'Include AI summary')
  .option('--from <date>', 'Start date (YYYY-MM-DD)')
  .option('--to <date>', 'End date (YYYY-MM-DD)')
  .action(async (options) => {
    const md = await generateReview('monthly', options.ai ?? false, options.from, options.to)
    console.log(md)
  })

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

program
  .command('serve')
  .description('Start MCP server')
  .action(async () => {
    const { startMcpServer } = await import('./mcp-server.js')
    await startMcpServer()
  })

void runCli(program)
