import { describe, it, expect, vi } from 'vitest'
import { buildPrompt, generateSummary } from '../src/summarizer.js'
import type { CollectedItem } from '../src/types.js'

const { mockCreate, mockOpenAI } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({
    choices: [{ message: { content: 'Mock summary content' } }]
  }),
  mockOpenAI: vi.fn()
}))

vi.mock('openai', () => {
  mockOpenAI.mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }))
  return { default: mockOpenAI }
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
    const config = { ai: { apiKey: 'ds-key', provider: 'deepseek', model: 'deepseek-chat' } }
    const result = await generateSummary(items, config as any, 'daily')
    expect(mockOpenAI).toHaveBeenCalledWith({
      apiKey: 'ds-key',
      baseURL: 'https://api.deepseek.com'
    })
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

  it('prompt includes thematic grouping instruction', async () => {
    const { buildPrompt } = await import('../src/summarizer.js')
    const items: CollectedItem[] = [{ id: '1', source: 'linear', type: 'task', title: 'Fix bug', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }]
    const prompt = buildPrompt(items, 'daily')
    expect(prompt).toContain('thematically')
    expect(prompt).toContain('project area')
    expect(prompt).toContain('chronologically')
  })

  it('uses custom prompt template from config when provided', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Deploy fix', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }
    ]
    const prompt = buildPrompt(items, 'daily', 'Custom: {period} — {sections}')
    expect(prompt).toBe('Custom: daily — [linear/task] Deploy fix (Done)')
  })
})
