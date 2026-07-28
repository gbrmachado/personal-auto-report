import { describe, it, expect, vi } from 'vitest'

const { mockSearch, mockListReviews } = vi.hoisted(() => ({
  mockSearch: vi.fn().mockImplementation(({ q }) => {
    if (q.includes('author:')) {
      return Promise.resolve({
        data: {
          items: [
            { id: 1, title: 'My PR', html_url: 'https://github.com/foo/bar/pull/1', state: 'open',
              created_at: '2026-07-27T10:00:00Z', updated_at: '2026-07-27T11:00:00Z',
              body: 'desc', number: 1, repository_url: 'https://api.github.com/repos/foo/bar' }
          ]
        }
      })
    }
    return Promise.resolve({
      data: {
        items: [
          { id: 2, title: 'Reviewed PR', html_url: 'https://github.com/foo/bar/pull/2', state: 'merged',
            created_at: '2026-07-26T10:00:00Z', updated_at: '2026-07-28T11:00:00Z',
            body: 'desc', number: 2, repository_url: 'https://api.github.com/repos/foo/bar' }
        ]
      }
    })
  }),
  mockListReviews: vi.fn().mockResolvedValue({
    data: [
      { user: { login: 'testuser' }, submitted_at: '2026-07-27T12:00:00Z', state: 'APPROVED' }
    ]
  })
}))

vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      search: { issuesAndPullRequests: mockSearch },
      pulls: { listReviews: mockListReviews }
    }
  }))
}))

import { GitHubCollector } from '../../src/collectors/github.js'

describe('GitHubCollector', () => {
  it('uses created date for authored PRs', async () => {
    const collector = new GitHubCollector()
    const date = '2026-07-27'
    const items = await collector.collect(
      { start: new Date(date), end: new Date(date) },
      { github: { token: 'test' }, user: { github: 'testuser' } }
    )
    const created = items.find(i => i.type === 'pr_created')
    expect(created).toBeDefined()
    expect(created!.timestamp).toEqual(new Date('2026-07-27T10:00:00Z'))
    expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({
      q: expect.stringContaining('created:')
    }))
  })

  it('fetches actual review timestamps for reviewed PRs', async () => {
    const collector = new GitHubCollector()
    const date = '2026-07-27'
    const items = await collector.collect(
      { start: new Date(date), end: new Date(date) },
      { github: { token: 'test' }, user: { github: 'testuser' } }
    )
    const reviewed = items.find(i => i.type === 'pr_reviewed')
    expect(reviewed).toBeDefined()
    expect(reviewed!.timestamp).toEqual(new Date('2026-07-27T12:00:00Z'))
    expect(mockListReviews).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 2 }))
  })
})
