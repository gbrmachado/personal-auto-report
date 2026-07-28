import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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

const CONFIG_DIR = join(homedir(), '.config', 'review')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error('Config not found. Run `review init` first.')
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export async function initConfig(): Promise<void> {
  throw new Error('initConfig not yet implemented')
}
