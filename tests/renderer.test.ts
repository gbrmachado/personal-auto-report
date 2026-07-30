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

  it('skips task narratives when crossRefs target no linear items', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'linear-1', source: 'linear', type: 'task', title: 'T', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { identifier: 'ENG-1' } }
    ]
    const crossRefs = [{ sourceItemId: 's1', targetItemId: 'nonexistent', relationType: 'mentioned_in' as const, context: 'irrelevant' }]
    const result = renderReview(items, 'daily', '2026-07-29', 'Summary', [], crossRefs)
    expect(result).not.toContain('Task Narratives')
  })

  it('falls back to item id in narrative heading when identifier is missing', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'linear-uuid', source: 'linear', type: 'task', title: 'T', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: {} }
    ]
    const crossRefs = [{ sourceItemId: 's1', targetItemId: 'linear-uuid', relationType: 'mentioned_in' as const, context: 'chat' }]
    const itemsWithSource: CollectedItem[] = [
      ...items,
      { id: 's1', source: 'slack', type: 'slack_message', title: 'ENG-1 done', url: null, status: null, timestamp: new Date(), description: null, metadata: null }
    ]
    const result = renderReview(itemsWithSource, 'daily', '', 'Summary', [], crossRefs)
    expect(result).toContain('### linear-uuid')
  })

  it('shows completed in narrative when task status is null', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'linear-1', source: 'linear', type: 'task', title: 'T', url: null, status: null, timestamp: new Date(), description: null, metadata: { identifier: 'ENG-1' } }
    ]
    const crossRefs = [{ sourceItemId: 's1', targetItemId: 'linear-1', relationType: 'mentioned_in' as const, context: '' }]
    const itemsWithSource: CollectedItem[] = [
      ...items,
      { id: 's1', source: 'slack', type: 'slack_message', title: 'ENG-1 done', url: null, status: null, timestamp: new Date(), description: null, metadata: null }
    ]
    const result = renderReview(itemsWithSource, 'daily', '', 'Summary', [], crossRefs)
    expect(result).toContain('✅ completed')
  })

  it('shows dash in Related column when no cross-refs match', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'linear-1', source: 'linear', type: 'task', title: 'T', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }
    ]
    const result = renderReview(items, 'daily', '', undefined, [], [])
    expect(result).toContain('| - |')
  })

  it('renders unknown relationType verbatim in Related column', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'linear-1', source: 'linear', type: 'task', title: 'T', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null }
    ]
    const crossRefs = [{ sourceItemId: 's1', targetItemId: 'linear-1', relationType: 'blocks' as any, context: '' }]
    const result = renderReview(items, 'daily', '', undefined, [], crossRefs as any)
    expect(result).toContain('blocks')
  })

  it('sorts related items chronologically in task narratives', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'linear-1', source: 'linear', type: 'task', title: 'T', url: null, status: 'Done', timestamp: new Date('2026-07-28T10:00:00Z'), description: null, metadata: { identifier: 'ENG-1' } },
      { id: 'gh-1', source: 'github', type: 'pr_created', title: 'PR later', url: null, status: 'open', timestamp: new Date('2026-07-29T12:00:00Z'), description: null, metadata: { repo: 'r' } },
      { id: 'slack-1', source: 'slack', type: 'slack_message', title: 'Slack earlier', url: null, status: null, timestamp: new Date('2026-07-29T08:00:00Z'), description: null, metadata: { channel: 'eng' } }
    ]
    const crossRefs = [
      { sourceItemId: 'gh-1', targetItemId: 'linear-1', relationType: 'implements' as const, context: '' },
      { sourceItemId: 'slack-1', targetItemId: 'linear-1', relationType: 'mentioned_in' as const, context: '' }
    ]
    const result = renderReview(items, 'daily', '', 'Summary', [], crossRefs)
    const slackIdx = result.indexOf('Discussed in #eng')
    const prIdx = result.indexOf('PR opened')
    expect(slackIdx).toBeGreaterThan(0)
    expect(prIdx).toBeGreaterThan(slackIdx)
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

  it('groups tasks by team when groupBy is team', () => {
    const items: CollectedItem[] = [
      { id: 'l1', source: 'linear', type: 'task', title: 'Fix A', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { team: 'Eng', identifier: 'ENG-1' } },
      { id: 'l2', source: 'linear', type: 'task', title: 'Fix B', url: null, status: 'Todo', timestamp: new Date(), description: null, metadata: { team: 'Eng', identifier: 'ENG-2' } },
      { id: 'l3', source: 'linear', type: 'task', title: 'Design C', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { team: 'Design', identifier: 'DSG-1' } }
    ]
    const result = renderReview(items, 'daily', '2026-07-30', undefined, [], [], 'team')
    expect(result).toContain('### Eng')
    expect(result).toContain('### Design')
    expect(result).toContain('Fix A')
    expect(result).toContain('Design C')
  })

  it('groups tasks by project when groupBy is project', () => {
    const items: CollectedItem[] = [
      { id: 'l1', source: 'linear', type: 'task', title: 'Feature X', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { project: 'Checkout', team: 'Eng' } },
      { id: 'l2', source: 'linear', type: 'task', title: 'Feature Y', url: null, status: 'Todo', timestamp: new Date(), description: null, metadata: { project: 'Giveaway', team: 'Eng' } }
    ]
    const result = renderReview(items, 'daily', '2026-07-30', undefined, [], [], 'project')
    expect(result).toContain('### Checkout')
    expect(result).toContain('### Giveaway')
    expect(result).toContain('Feature X')
    expect(result).toContain('Feature Y')
  })

  it('falls back to Other group when metadata is null', () => {
    const items: CollectedItem[] = [
      { id: 'l1', source: 'linear', type: 'task', title: 'Task 1', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: null },
      { id: 'l2', source: 'linear', type: 'task', title: 'Task 2', url: null, status: 'Todo', timestamp: new Date(), description: null, metadata: { team: 'Eng' } }
    ]
    const result = renderReview(items, 'daily', '2026-07-30', undefined, [], [], 'team')
    expect(result).toContain('### Other')
    expect(result).toContain('### Eng')
    expect(result).toContain('Task 1')
    expect(result).toContain('Task 2')
  })

  it('falls back to flat table when groupBy is none', async () => {
    const { renderReview } = await import('../src/renderer.js')
    const items: CollectedItem[] = [
      { id: 'l1', source: 'linear', type: 'task', title: 'Task A', url: null, status: 'Done', timestamp: new Date(), description: null, metadata: { team: 'Eng' } }
    ]
    const result = renderReview(items, 'daily', '2026-07-30', undefined, [], [], 'none')
    expect(result).not.toContain('### Eng')
    expect(result).toContain('## Linear Tasks')
    expect(result).toContain('| Title | Status | Related | Link |')
  })
})
