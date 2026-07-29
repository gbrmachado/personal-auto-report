import { describe, it, expect } from 'vitest'
import type { CollectedItem, CrossRef } from '../src/types.js'

describe('crossReference', () => {
  it('returns mentioned_in when slack message contains linear issue ID', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'slack-c123',
        source: 'slack',
        type: 'slack_message',
        title: 'Hey, check ENG-1234 in production',
        url: null,
        status: null,
        timestamp: new Date(),
        description: 'Hey, check ENG-1234 in production',
        metadata: { channel: 'eng' }
      },
      {
        id: 'linear-issue-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test issue',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toHaveLength(1)
    expect(result[0].sourceItemId).toBe('slack-c123')
    expect(result[0].targetItemId).toBe('linear-issue-uuid')
    expect(result[0].relationType).toBe('mentioned_in')
  })

  it('returns implements when PR title contains linear issue ID', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'gh-pr-42',
        source: 'github',
        type: 'pr_created',
        title: 'ENG-1234 Fix token minting',
        url: 'https://github.com/org/repo/pull/42',
        status: 'open',
        timestamp: new Date(),
        description: null,
        metadata: { repo: 'org/repo' }
      },
      {
        id: 'linear-issue-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test issue',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toHaveLength(1)
    expect(result[0].sourceItemId).toBe('gh-pr-42')
    expect(result[0].targetItemId).toBe('linear-issue-uuid')
    expect(result[0].relationType).toBe('implements')
  })

  it('returns empty array when no matches found', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'slack-c1',
        source: 'slack',
        type: 'slack_message',
        title: 'Random chat',
        url: null,
        status: null,
        timestamp: new Date(),
        description: null,
        metadata: null
      },
      {
        id: 'linear-issue-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test issue',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toEqual([])
  })

  it('is case-insensitive when matching linear IDs', async () => {
    const { crossReference } = await import('../src/crossref.js')
    const items: CollectedItem[] = [
      {
        id: 'slack-c1',
        source: 'slack',
        type: 'slack_message',
        title: 'check eng-1234 is done',
        url: null,
        status: null,
        timestamp: new Date(),
        description: null,
        metadata: null
      },
      {
        id: 'linear-uuid',
        source: 'linear',
        type: 'task',
        title: 'Test',
        url: 'https://linear.app/team/issue/ENG-1234',
        status: 'Done',
        timestamp: new Date(),
        description: null,
        metadata: { identifier: 'ENG-1234' }
      }
    ]
    const result = crossReference(items)
    expect(result).toHaveLength(1)
  })
})
