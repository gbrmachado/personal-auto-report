import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeFocusCommand, registerFocusCommand } from '../src/focus/command.js'

const loadConfigMock = vi.fn()
const runFocusMock = vi.fn()

vi.mock('../src/config.js', () => ({
  loadConfig: (...args: unknown[]) => loadConfigMock(...args)
}))
vi.mock('../src/focus/run.js', () => ({
  runFocus: (...args: unknown[]) => runFocusMock(...args)
}))

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

describe('executeFocusCommand', () => {
  beforeEach(() => {
    loadConfigMock.mockReset().mockReturnValue({ mock: 'config' })
    runFocusMock.mockReset().mockResolvedValue({
      adapter: 'stdout', eventId: 'focus-1', deliveredAt: new Date().toISOString()
    })
  })

  it('rejects an unsupported format before loading config or running', async () => {
    await expect(executeFocusCommand({
      format: 'yaml', timezone: 'UTC', maxItems: 3, staleAfterDays: 3
    })).rejects.toThrow('Format must be markdown or json.')

    expect(loadConfigMock).not.toHaveBeenCalled()
    expect(runFocusMock).not.toHaveBeenCalled()
  })

  it('delivers through StdoutOutput when no --output path is given', async () => {
    await executeFocusCommand({ format: 'markdown', timezone: 'UTC', maxItems: 3, staleAfterDays: 3 })

    expect(runFocusMock).toHaveBeenCalledTimes(1)
    const [, output, options] = runFocusMock.mock.calls[0]
    expect(output.name).toBe('stdout')
    expect(options).toEqual({ timezone: 'UTC', maxPrimaryItems: 3, staleAfterDays: 3 })
  })

  it('delivers through FileOutput when --output is given', async () => {
    await executeFocusCommand({
      format: 'json', output: '/tmp/focus.json', timezone: 'UTC', maxItems: 5, staleAfterDays: 2
    })

    expect(runFocusMock).toHaveBeenCalledTimes(1)
    const [, output] = runFocusMock.mock.calls[0]
    expect(output.name).toBe('file')
  })
})
