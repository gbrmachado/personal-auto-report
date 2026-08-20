import { describe, it, expect, vi } from 'vitest'

const { LinearClient } = vi.hoisted(() => ({
  LinearClient: vi.fn().mockImplementation(() => ({
    viewer: Promise.resolve({ id: 'user-1' }),
    issues: vi.fn().mockResolvedValue({
      nodes: [
        {
          id: 'issue-1',
          title: 'Test issue',
          url: 'https://linear.app/team/issue/TEST-1',
          updatedAt: '2026-07-27T10:00:00.000Z',
          description: 'A test issue',
          state: { name: 'In Progress' },
          priority: 2,
          team: { name: 'Engineering' },
          project: Promise.resolve({ name: 'Checkout' }),
          identifier: 'TEST-1'
        }
      ]
    })
  }))
}))

vi.mock('@linear/sdk', () => ({ LinearClient }))

import { LinearCollector } from '../../src/collectors/linear.js'

describe('LinearCollector status history', () => {
  it('maps workflow-state history entries through the state name lookup, ignoring non-state changes', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      workflowStates: vi.fn().mockResolvedValue({
        nodes: [
          { id: 'state-todo', name: 'Todo' },
          { id: 'state-progress', name: 'In Progress' },
          { id: 'state-review', name: 'In Review' }
        ]
      }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-hist',
            title: 'Task with history',
            url: 'https://linear.app/team/issue/TEST-4',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'In Review' },
            priority: 2,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-4',
            startedAt: '2026-07-22T00:00:00.000Z',
            completedAt: undefined,
            history: vi.fn().mockResolvedValue({
              nodes: [
                { toStateId: 'state-review', fromStateId: 'state-progress', createdAt: '2026-07-26T00:00:00.000Z' },
                { toStateId: 'state-progress', fromStateId: 'state-todo', createdAt: '2026-07-23T00:00:00.000Z' },
                { toAssigneeId: 'user-2', fromAssigneeId: 'user-1', createdAt: '2026-07-24T00:00:00.000Z' }
              ]
            })
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].statusHistory).toEqual([
      { from: 'Todo', to: 'In Progress', changedAt: new Date('2026-07-23T00:00:00.000Z') },
      { from: 'In Progress', to: 'In Review', changedAt: new Date('2026-07-26T00:00:00.000Z') }
    ])
    expect(items[0].metadata?.startedAt).toBe('2026-07-22T00:00:00.000Z')
    expect(items[0].metadata?.completedAt).toBeNull()
  })

  it('degrades to null status history when history() is unavailable', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-nohist',
            title: 'Task without history support',
            url: 'https://linear.app/team/issue/TEST-5',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Todo' },
            priority: 1,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-5'
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].statusHistory).toBeNull()
  })
})

describe('LinearCollector', () => {
  it('returns collected items', async () => {
    const collector = new LinearCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Test issue')
    expect(items[0].source).toBe('linear')
    expect(items[0].metadata?.project).toBe('Checkout')
  })

  it('handles null project metadata', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-2',
            title: 'No project issue',
            url: 'https://linear.app/team/issue/TEST-2',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Todo' },
            priority: 1,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-2'
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.project).toBeNull()
  })

  it('maps github attachments to linkedPRs, ignoring non-github sources', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-pr',
            title: 'Task with linked PR',
            url: 'https://linear.app/team/issue/TEST-6',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Done' },
            priority: 2,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-6',
            attachments: vi.fn().mockResolvedValue({
              nodes: [
                {
                  sourceType: 'oauthClient',
                  title: 'Devin Session',
                  url: 'https://app.devin.ai/session/1',
                  metadata: {}
                },
                {
                  sourceType: 'github',
                  title: 'feat: fix thing (TEST-6)',
                  url: 'https://github.com/org/repo/pull/42',
                  metadata: {
                    repoLogin: 'org',
                    repoName: 'repo',
                    status: 'merged',
                    mergedAt: '2026-07-27T09:00:00.000Z',
                    closedAt: '2026-07-27T09:00:00.000Z',
                    linkKind: 'closes'
                  }
                }
              ]
            })
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.linkedPRs).toEqual([
      {
        title: 'feat: fix thing (TEST-6)',
        url: 'https://github.com/org/repo/pull/42',
        repo: 'org/repo',
        status: 'merged',
        mergedAt: '2026-07-27T09:00:00.000Z',
        closedAt: '2026-07-27T09:00:00.000Z',
        linkKind: 'closes'
      }
    ])
  })

  it('ignores github issue attachments that share sourceType github', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-gh-issue',
            title: 'Synced GitHub issue',
            url: 'https://linear.app/team/issue/TEST-7',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Todo' },
            priority: 2,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-7',
            attachments: vi.fn().mockResolvedValue({
              nodes: [
                {
                  sourceType: 'github',
                  title: 'Upstream GitHub issue',
                  url: 'https://github.com/org/repo/issues/99',
                  metadata: {}
                },
                {
                  sourceType: 'github',
                  title: 'feat: real PR',
                  url: 'https://github.com/org/repo/pull/100',
                  metadata: {}
                }
              ]
            })
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.linkedPRs).toEqual([
      {
        title: 'feat: real PR',
        url: 'https://github.com/org/repo/pull/100',
        repo: 'org/repo',
        status: null,
        mergedAt: null,
        closedAt: null,
        linkKind: null
      }
    ])
  })

  it('infers repo from PR URL or subtitle when attachment metadata is empty', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-pr-meta',
            title: 'Task with sparse metadata',
            url: 'https://linear.app/team/issue/TEST-8',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Done' },
            priority: 2,
            team: { name: 'Engineering' },
            project: Promise.resolve(null),
            identifier: 'TEST-8',
            attachments: vi.fn().mockResolvedValue({
              nodes: [
                {
                  sourceType: 'github',
                  title: 'Fix flaky tests',
                  url: 'https://github.com/acme/app/pull/7',
                  subtitle: 'acme/app • PR #7',
                  metadata: {}
                }
              ]
            })
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.linkedPRs).toEqual([
      {
        title: 'Fix flaky tests',
        url: 'https://github.com/acme/app/pull/7',
        repo: 'acme/app',
        status: null,
        mergedAt: null,
        closedAt: null,
        linkKind: null
      }
    ])
  })

  it('defaults linkedPRs to an empty array when attachments() is unavailable', async () => {
    const collector = new LinearCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.linkedPRs).toEqual([])
  })

  it('handles null team metadata', async () => {
    vi.mocked(LinearClient).mockImplementationOnce(() => ({
      viewer: Promise.resolve({ id: 'user-1' }),
      issues: vi.fn().mockResolvedValue({
        nodes: [
          {
            id: 'issue-3',
            title: 'No team issue',
            url: 'https://linear.app/team/issue/TEST-3',
            updatedAt: '2026-07-27T10:00:00.000Z',
            description: null,
            state: { name: 'Todo' },
            priority: 1,
            team: Promise.resolve(null),
            project: Promise.resolve(null),
            identifier: 'TEST-3'
          }
        ]
      })
    }))
    const { LinearCollector: LC } = await import('../../src/collectors/linear.js')
    const collector = new LC()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { linear: { apiKey: 'test' }, user: { linear: 'test@test.com' } }
    )
    expect(items[0].metadata?.team).toBeNull()
    expect(items[0].metadata?.project).toBeNull()
  })
})
