import { Command } from 'commander'
import { describe, expect, it, vi } from 'vitest'
import { registerFocusCommand } from '../src/focus/command.js'

describe('focus command', () => {
  it('parses focus policy and output options independently from execution', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const program = new Command().exitOverride()
    registerFocusCommand(program, execute)

    await program.parseAsync([
      'node', 'review', 'focus', '--format', 'json', '--output', '/tmp/focus.json',
      '--timezone', 'America/New_York', '--max-items', '2', '--stale-after-days', '4'
    ])

    expect(execute).toHaveBeenCalledWith({
      format: 'json', output: '/tmp/focus.json', timezone: 'America/New_York',
      maxItems: 2, staleAfterDays: 4
    })
  })
})
