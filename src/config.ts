import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import os from 'os'

export interface Config {
  linear: { apiKey: string }
  github: { token: string }
  slack: { token: string }
  user: {
    linear: string
    github: string
    slack: string
  }
  ai: {
    provider: 'openai' | 'anthropic'
    apiKey: string
    model: string
  }
  db: {
    path: string
  }
}

export function getConfigDir(): string {
  return join(os.homedir(), '.config', 'review')
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json')
}

export function loadConfig(): Config {
  if (!existsSync(getConfigPath())) {
    throw new Error('Config not found. Run `review init` first.')
  }
  return JSON.parse(readFileSync(getConfigPath(), 'utf-8'))
}

export function saveConfig(config: Config): void {
  if (!existsSync(getConfigDir())) {
    mkdirSync(getConfigDir(), { recursive: true })
  }
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), { mode: 0o600 })
}

export async function initConfig(): Promise<void> {
  throw new Error('initConfig not yet implemented')
}
