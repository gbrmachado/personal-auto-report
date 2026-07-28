#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
program
  .name('review')
  .description('AI-powered professional review generator')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize configuration')
  .action(async () => {
    const { initConfig } = await import('./config.js')
    await initConfig()
    console.log('Configuration saved to ~/.config/review/config.json')
  })

program
  .command('daily')
  .description('Generate daily review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    console.log('Daily review coming soon')
  })

program
  .command('weekly')
  .description('Generate weekly review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    console.log('Weekly review coming soon')
  })

program
  .command('monthly')
  .description('Generate monthly review')
  .option('--ai', 'Include AI summary')
  .action(async (options) => {
    console.log('Monthly review coming soon')
  })

program
  .command('serve')
  .description('Start MCP server')
  .action(async () => {
    console.log('MCP server coming soon')
  })

program.parse()
