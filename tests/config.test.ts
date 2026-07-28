import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { writeFileSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import os from 'os'

const testDir = join(tmpdir(), 'review-test-' + Date.now())
const testConfigDir = join(testDir, '.config', 'review')
const testConfigPath = join(testConfigDir, 'config.json')

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
})
