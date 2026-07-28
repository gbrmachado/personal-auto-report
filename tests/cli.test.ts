import { describe, expect, it, vi } from 'vitest'

describe('runCli', () => {
  it('reports async command errors and sets a failing exit code', async () => {
    const parseAsync = vi.fn().mockRejectedValue(new Error('config missing'))
    const reportError = vi.fn()
    const setExitCode = vi.fn()
    const { runCli } = await import('../src/cli.js')

    await runCli({ parseAsync }, reportError, setExitCode)

    expect(reportError).toHaveBeenCalledWith('Error: config missing')
    expect(setExitCode).toHaveBeenCalledWith(1)
  })
})
