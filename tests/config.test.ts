import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { Config } from '../src/config.js'
import { writeFileSync, rmSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import os from 'os'

const testDir = join(tmpdir(), 'review-test-' + Date.now())

describe('config', () => {
  let origHomedir: typeof os.homedir

  beforeAll(() => {
    origHomedir = os.homedir
    os.homedir = () => testDir
  })

  afterAll(() => {
    os.homedir = origHomedir
  })

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  it('throws when config file does not exist', async () => {
    const { loadConfig } = await import('../src/config.js')
    expect(() => loadConfig()).toThrow('Config not found')
  })

  it('saves and loads config correctly', async () => {
    const { saveConfig, loadConfig } = await import('../src/config.js')
    const config = {
      linear: { apiKey: 'lin-key' },
      github: { token: 'gh-token' },
      slack: { token: 'sl-token' },
      user: { linear: 'user', github: 'user', slack: 'user' },
      ai: { provider: 'openai' as const, apiKey: 'ai-key', model: 'gpt-4' },
      db: { path: '/tmp/test.db' }
    }
    saveConfig(config)
    const loaded = loadConfig()
    expect(loaded.linear.apiKey).toBe('lin-key')
    expect(loaded.github.token).toBe('gh-token')
    expect(loaded.ai.provider).toBe('openai')
  })

  it('parses supported AI providers and rejects invalid input', async () => {
    const { parseAiProvider } = await import('../src/config.js')

    expect(parseAiProvider('')).toBe('openai')
    expect(parseAiProvider('DEEPSEEK')).toBe('deepseek')
    expect(() => parseAiProvider('anthropic')).toThrow('Unsupported AI provider')
  })

  it('parses config with github filter and display groupBy', () => {
    const config: Config = {
      linear: { apiKey: 'k' },
      github: { token: 't', filter: { includeRepos: ['org/*'], excludeRepos: ['org/legacy'] } },
      slack: { token: 't' },
      user: { linear: 'a', github: 'b', slack: 'c' },
      ai: { provider: 'openai', apiKey: 'k', model: 'gpt-4o-mini' },
      db: { path: ':memory:' },
      display: { groupBy: 'project' }
    }
    expect(config.github.filter?.includeRepos).toEqual(['org/*'])
    expect(config.display?.groupBy).toBe('project')
  })
})
