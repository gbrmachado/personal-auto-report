import { describe, it, expect } from 'vitest'
import { renderReview } from '../src/renderer.js'
import type { CollectedItem } from '../src/types.js'

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
