export interface AsyncCommandParser {
  parseAsync(): Promise<unknown>
}

export async function runCli(
  program: AsyncCommandParser,
  reportError: (message: string) => void = console.error,
  setExitCode: (code: number) => void = code => { process.exitCode = code }
): Promise<void> {
  try {
    await program.parseAsync()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    reportError(`Error: ${message}`)
    setExitCode(1)
  }
}
