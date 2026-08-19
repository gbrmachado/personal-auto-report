import { Command, InvalidArgumentError } from 'commander'
import { loadConfig } from '../config.js'
import { FileOutput } from '../outputs/file.js'
import { StdoutOutput } from '../outputs/stdout.js'
import { runFocus } from './run.js'
import type { FocusFormat } from './renderers.js'

export interface FocusCommandOptions {
  format: string
  output?: string
  timezone: string
  maxItems: number
  staleAfterDays: number
}

export type ExecuteFocusCommand = (options: FocusCommandOptions) => Promise<void>

function positiveInteger(value: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new InvalidArgumentError('Expected a positive integer.')
  }
  return parsed
}

export async function executeFocusCommand(options: FocusCommandOptions): Promise<void> {
  if (options.format !== 'markdown' && options.format !== 'json') {
    throw new InvalidArgumentError('Format must be markdown or json.')
  }
  const format = options.format as FocusFormat
  const output = options.output
    ? new FileOutput(options.output, format)
    : new StdoutOutput(format)

  await runFocus(loadConfig(), output, {
    timezone: options.timezone,
    maxPrimaryItems: options.maxItems,
    staleAfterDays: options.staleAfterDays
  })
}

export function registerFocusCommand(
  program: Command,
  execute: ExecuteFocusCommand = executeFocusCommand
): void {
  program
    .command('focus')
    .description('Generate a bounded daily engineering focus plan')
    .option('--format <format>', 'Output format: markdown or json', 'markdown')
    .option('--output <path>', 'Write through the file output adapter')
    .option('--timezone <timezone>', 'Timezone used for the report date', 'UTC')
    .option('--max-items <count>', 'Maximum primary focus items', positiveInteger, 3)
    .option('--stale-after-days <count>', 'Flag items after this many days', positiveInteger, 3)
    .action(async (options: FocusCommandOptions) => execute(options))
}
