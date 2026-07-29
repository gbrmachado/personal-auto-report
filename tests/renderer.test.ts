import { describe, it, expect } from 'vitest'
import { renderReview } from '../src/renderer.js'
import type { CollectedItem, CrossRef } from '../src/types.js'

describe('renderer', () => {
  it('renders daily review with all sections', () => {
    const items: CollectedItem[] = [
      { id: '1', source: 'linear', type: 'task', title: 'Fix bug', url: 'https://linear.app/test', status: 'Done', timestamp: new Date(), description: null, metadata: null },
      { id: '2', source: 'github', type: 'pr_created', title: 'Add feature', url: 'https://github.com/foo/bar/pull/1', status: 'open', timestamp: new Date(), description: null, metadata: { repo: 'foo/bar' } },
      { id: '3', source: 'slack', type: 'slack_message', title: 'Hey @me', url: null, status: null, timestamp: new Date(), description: null, metadata: { channel: 'C123' } }
    ]

    const md = renderReview(items, 'daily', '2026-07-27', 'Great work today!')
    expect(md).toContain('# Daily Review — 2026-07-27')
    expect(md).toContain('Great work today!')
    expect(md).toContain('Fix bug')
    expect(md).toContain('Add feature')
    expect(md).toContain('Slack Highlights')
  })

  it('renders heading for weekly reviews', () => {
    const md = renderReview([], 'weekly', 'Jul 21 - Jul 27')
    expect(md).toContain('# Weekly Review — Jul 21 - Jul 27')
  })

  it('adds Related column when cross-references exist', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const crossRefs: CrossRef[] = [
      {
        sourceItemId: 'slack-c1',
        targetItemId: 'linear-1',
        relationType: 'mentioned_in' as const,
        context: 'check ENG-1'
      },
      {
        sourceItemId: 'gh-1',
        targetItemId: 'linear-1',
        relationType: 'implements' as const,
        context: 'ENG-1 fix'
      }
    ]
    const items: CollectedItem[] = [
      {
        id: 'linear-1', source: 'linear', type: 'task',
        title: 'Test', url: null, status: 'Done',
        timestamp: new Date(), description: null,
        metadata: { identifier: 'ENG-1' }
      }
    ]
    const result = renderReview(items, 'daily', '2026-07-29', undefined, [], crossRefs)
    expect(result).toContain('Related')
    expect(result).toContain('💬 slack')
    expect(result).toContain('🔀 pr')
  })

  it('renders task narratives when aiSummary is present', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const now = new Date('2026-07-29T12:00:00Z')
    const crossRefs = [
      {
        sourceItemId: 'slack-c1',
        targetItemId: 'linear-1',
        relationType: 'mentioned_in' as const,
        context: 'discussed in #eng'
      },
      {
        sourceItemId: 'gh-1',
        targetItemId: 'linear-1',
        relationType: 'implements' as const,
        context: 'PR #42'
      }
    ]
    const items: CollectedItem[] = [
      {
        id: 'linear-1', source: 'linear', type: 'task',
        title: 'Test ENG-1', url: null, status: 'Done',
        timestamp: new Date('2026-07-28T10:00:00Z'), description: null,
        metadata: { identifier: 'ENG-1' }
      },
      {
        id: 'gh-1', source: 'github', type: 'pr_created',
        title: 'ENG-1 fix', url: null, status: 'merged',
        timestamp: new Date('2026-07-29T08:00:00Z'), description: null,
        metadata: { repo: 'org/repo' }
      },
      {
        id: 'slack-c1', source: 'slack', type: 'slack_message',
        title: 'discussed in #eng', url: null, status: null,
        timestamp: new Date('2026-07-29T09:00:00Z'), description: null,
        metadata: { channel: 'eng' }
      }
    ]
    const result = renderReview(items, 'daily', '2026-07-29', 'AI summary here', [], crossRefs)
    expect(result).toContain('## Task Narratives')
    expect(result).toContain('Test ENG-1')
    expect(result).toContain('Jul 29')
    expect(result).toContain('PR #42')
  })

  it('skips task narratives when aiSummary is absent', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      {
        id: 'linear-1', source: 'linear', type: 'task',
        title: 'Test', url: null, status: 'Done',
        timestamp: new Date(), description: null,
        metadata: { identifier: 'ENG-1' }
      }
    ]
    const result = renderReview(items, 'daily', '2026-07-29', undefined, [], [])
    expect(result).not.toContain('## Task Narratives')
  })

  it('renders warnings section when warnings are provided', () => {
    const md = renderReview([], 'daily', '2026-07-27', undefined, [
      'Linear collector failed: API timeout',
      'Slack collector failed: Invalid token'
    ])
    expect(md).toContain('## Warnings')
    expect(md).toContain('- Linear collector failed: API timeout')
    expect(md).toContain('- Slack collector failed: Invalid token')
  })
})
