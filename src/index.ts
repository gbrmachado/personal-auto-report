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

void runCli(program)
