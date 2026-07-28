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
  const { createInterface } = await import('readline/promises')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const q = (query: string) => rl.question(query + ': ')

  console.log('ai-professional-review Configuration\n')

  const config: Config = {
    linear: { apiKey: await q('Linear API Key') },
    github: { token: await q('GitHub Personal Access Token') },
    slack: { token: await q('Slack User Token (xoxp-...)') },
    user: {
      linear: await q('Your Linear email'),
      github: await q('Your GitHub username'),
      slack: await q('Your Slack member ID')
    },
    ai: {
      provider: (await q('AI provider (openai/anthropic)')) as 'openai' | 'anthropic' || 'openai',
      apiKey: await q('AI API Key'),
      model: await q('AI model (default: gpt-4o-mini)') || 'gpt-4o-mini'
    },
    db: {
      path: join(getConfigDir(), 'review.db')
    }
  }

  saveConfig(config)
  rl.close()
}
