import { describe, it, expect, vi } from 'vitest'

const { mockRequest, mockListReviews } = vi.hoisted(() => ({
  mockRequest: vi.fn().mockImplementation((route, { q } = {}) => {
    if (q?.includes('author:')) {
      return {
        data: {
          items: [
            { id: 1, title: 'My PR', html_url: 'https://github.com/foo/bar/pull/1', state: 'open',
              created_at: '2026-07-27T10:00:00Z',
              body: 'desc', number: 1, repository_url: 'https://api.github.com/repos/foo/bar' }
          ]
        }
      }
    }
    return {
      data: {
        items: [
          { id: 2, title: 'Reviewed PR', html_url: 'https://github.com/foo/bar/pull/2', state: 'merged',
            created_at: '2026-07-26T10:00:00Z',
            body: 'desc', number: 2, repository_url: 'https://api.github.com/repos/foo/bar' }
        ]
      }
    }
  }),
  mockListReviews: vi.fn().mockResolvedValue({
    data: [
      { user: { login: 'testuser' }, submitted_at: '2026-07-27T12:00:00Z', state: 'APPROVED' }
    ]
  })
}))

vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    request: mockRequest,
    rest: { pulls: { listReviews: mockListReviews } }
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
    expect(mockRequest).toHaveBeenCalledWith('GET /search/issues', expect.objectContaining({
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
