import { describe, it, expect, vi } from 'vitest'
import { buildPrompt, generateSummary } from '../src/summarizer.js'
import type { CollectedItem } from '../src/types.js'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Mock summary content' } }]
  })
}))

vi.mock('openai', () => {
  const MockOpenAI = vi.fn(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }))
  return { default: MockOpenAI }
})

describe('summarizer', () => {
  it('builds prompt from items', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Fix login bug', url: null, status: 'Done', timestamp: new Date(), description: 'Users could not log in with SSO', metadata: null }
    ]
    const prompt = buildPrompt(items, 'daily')
    expect(prompt).toContain('Fix login bug')
    expect(prompt).toContain('[linear/task]')
    expect(prompt).toContain('daily')
  })

  it('returns no-activity message for empty items', async () => {
    const result = await generateSummary([], { ai: { apiKey: 'test', provider: 'openai', model: 'gpt-4o-mini' } } as any, 'daily')
    expect(result).toBe('No activity to summarize.')
  })

  it('throws for unsupported AI provider', async () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Fix login bug', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }
    ]
    const config = { ai: { apiKey: 'test', provider: 'anthropic', model: 'claude-3' } }
    await expect(generateSummary(items, config as any, 'daily')).rejects.toThrow('Unsupported AI provider')
  })

  it('works with deepseek provider', async () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Test deepseek', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }
    ]
    const config = { ai: { apiKey: 'ds-key', provider: 'deepseek', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' } }
    const result = await generateSummary(items, config as any, 'daily')
    expect(mockCreate).toHaveBeenCalled()
    expect(result).toBe('Mock summary content')
  })

  it('calls OpenAI and returns generated summary', async () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Fix login bug', url: null, status: 'Done', timestamp: new Date(), description: 'Users could not log in with SSO', metadata: null }
    ]
    const config = { ai: { apiKey: 'test-key', provider: 'openai', model: 'gpt-4o-mini' } }
    const result = await generateSummary(items, config as any, 'weekly')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        messages: expect.arrayContaining([expect.objectContaining({ role: 'user' })])
      })
    )
    expect(result).toBe('Mock summary content')
  })
})
