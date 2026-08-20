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

describe('repoMatches', () => {
  it('matches exact repo name', async () => {
    const { repoMatches } = await import('../../src/collectors/github.js')
    expect(repoMatches('org/repo', 'org/repo')).toBe(true)
    expect(repoMatches('org/repo', 'other/repo')).toBe(false)
  })

  it('matches org glob pattern', async () => {
    const { repoMatches } = await import('../../src/collectors/github.js')
    expect(repoMatches('courtyard/checkout', 'courtyard/*')).toBe(true)
    expect(repoMatches('courtyard/api', 'courtyard/*')).toBe(true)
    expect(repoMatches('other/project', 'courtyard/*')).toBe(false)
  })
})

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

  it('filters by includeRepos', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 10, title: 'PR in foo/bar', html_url: 'https://github.com/foo/bar/pull/10', state: 'open',
                  created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 10,
                  repository_url: 'https://api.github.com/repos/foo/bar' },
                { id: 11, title: 'PR in other/proj', html_url: 'https://github.com/other/proj/pull/11', state: 'open',
                  created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 11,
                  repository_url: 'https://api.github.com/repos/other/proj' },
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test', filter: { includeRepos: ['foo/bar'] } }, user: { github: 'testuser' } }
      )

      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('PR in foo/bar')
      expect(items[0].metadata?.repo).toBe('foo/bar')
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })

  it('repoMatches handles edge cases', async () => {
    const { repoMatches } = await import('../../src/collectors/github.js')
    expect(repoMatches('org/repo', 'org/repo')).toBe(true)
    expect(repoMatches('org/repo', 'other/repo')).toBe(false)
    expect(repoMatches('a/b', 'a/*')).toBe(true)
    expect(repoMatches('x/y', 'a/*')).toBe(false)
    expect(repoMatches('', '')).toBe(true)
    expect(repoMatches('Org/Repo', 'org/repo')).toBe(false)
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

  it('filters by excludeRepos', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 10, title: 'PR in foo/bar', html_url: 'https://github.com/foo/bar/pull/10', state: 'open',
                  created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 10,
                  repository_url: 'https://api.github.com/repos/foo/bar' },
                { id: 11, title: 'PR in excluded/proj', html_url: 'https://github.com/excluded/proj/pull/11', state: 'open',
                  created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 11,
                  repository_url: 'https://api.github.com/repos/excluded/proj' },
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test', filter: { excludeRepos: ['excluded/proj'] } }, user: { github: 'testuser' } }
      )

      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('PR in foo/bar')
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })

  it('filters by org glob includeRepos in all PR sources', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 10, title: 'Authored in courtyard/checkout', html_url: 'https://github.com/courtyard/checkout/pull/10',
                  state: 'open', created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 10,
                  repository_url: 'https://api.github.com/repos/courtyard/checkout' },
              ]
            }
          }
        }
        if (q?.includes('reviewed-by:')) {
          return {
            data: {
              items: [
                { id: 20, title: 'Reviewed in courtyard/api', html_url: 'https://github.com/courtyard/api/pull/20',
                  state: 'merged', created_at: '2026-07-26T10:00:00Z', body: 'desc', number: 20,
                  repository_url: 'https://api.github.com/repos/courtyard/api' },
              ]
            }
          }
        }
        if (q?.includes('assignee:')) {
          return {
            data: {
              items: [
                { id: 30, title: 'Assigned from courtyard/docs', html_url: 'https://github.com/courtyard/docs/pull/30',
                  state: 'open', created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 30,
                  repository_url: 'https://api.github.com/repos/courtyard/docs' },
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test', filter: { includeRepos: ['courtyard/*'] } }, user: { github: 'testuser' } }
      )

      const created = items.find(i => i.type === 'pr_created')
      const reviewed = items.find(i => i.type === 'pr_reviewed')
      const assigned = items.find(i => i.type === 'pr_assigned')
      expect(created).toBeDefined()
      expect(reviewed).toBeDefined()
      expect(assigned).toBeDefined()
      expect(created!.metadata?.repo).toBe('courtyard/checkout')
      expect(reviewed!.metadata?.repo).toBe('courtyard/api')
      expect(assigned!.metadata?.repo).toBe('courtyard/docs')
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })

  it('builds a merged status history when pull_request.merged_at is set', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 40, title: 'Merged PR', html_url: 'https://github.com/foo/bar/pull/40', state: 'closed',
                  created_at: '2026-07-20T10:00:00Z', closed_at: '2026-07-25T10:00:00Z',
                  pull_request: { merged_at: '2026-07-25T10:00:00Z' },
                  body: 'desc', number: 40, repository_url: 'https://api.github.com/repos/foo/bar' }
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test' }, user: { github: 'testuser' } }
      )

      const created = items.find(i => i.type === 'pr_created')
      expect(created?.statusHistory).toEqual([
        { from: null, to: 'opened', changedAt: new Date('2026-07-20T10:00:00Z') },
        { from: 'opened', to: 'merged', changedAt: new Date('2026-07-25T10:00:00Z') }
      ])
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })

  it('builds a closed (not merged) status history when closed_at is set without merged_at', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 41, title: 'Closed PR', html_url: 'https://github.com/foo/bar/pull/41', state: 'closed',
                  created_at: '2026-07-20T10:00:00Z', closed_at: '2026-07-22T10:00:00Z',
                  body: 'desc', number: 41, repository_url: 'https://api.github.com/repos/foo/bar' }
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test' }, user: { github: 'testuser' } }
      )

      const created = items.find(i => i.type === 'pr_created')
      expect(created?.statusHistory).toEqual([
        { from: null, to: 'opened', changedAt: new Date('2026-07-20T10:00:00Z') },
        { from: 'opened', to: 'closed', changedAt: new Date('2026-07-22T10:00:00Z') }
      ])
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })

  it('builds a single-entry status history for still-open PRs', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 42, title: 'Open PR', html_url: 'https://github.com/foo/bar/pull/42', state: 'open',
                  created_at: '2026-07-20T10:00:00Z',
                  body: 'desc', number: 42, repository_url: 'https://api.github.com/repos/foo/bar' }
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test' }, user: { github: 'testuser' } }
      )

      const created = items.find(i => i.type === 'pr_created')
      expect(created?.statusHistory).toEqual([
        { from: null, to: 'opened', changedAt: new Date('2026-07-20T10:00:00Z') }
      ])
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })

  it('combined includeRepos and excludeRepos', async () => {
    const original = mockRequest.getMockImplementation()
    try {
      mockRequest.mockImplementation((route, { q } = {}) => {
        if (q?.includes('author:')) {
          return {
            data: {
              items: [
                { id: 10, title: 'PR in courtyard/current', html_url: 'https://github.com/courtyard/current/pull/10',
                  state: 'open', created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 10,
                  repository_url: 'https://api.github.com/repos/courtyard/current' },
                { id: 11, title: 'PR in courtyard/legacy', html_url: 'https://github.com/courtyard/legacy/pull/11',
                  state: 'open', created_at: '2026-07-27T10:00:00Z', body: 'desc', number: 11,
                  repository_url: 'https://api.github.com/repos/courtyard/legacy' },
              ]
            }
          }
        }
        return { data: { items: [] } }
      })

      const collector = new GitHubCollector()
      const date = '2026-07-27'
      const items = await collector.collect(
        { start: new Date(date), end: new Date(date) },
        { github: { token: 'test', filter: { includeRepos: ['courtyard/*'], excludeRepos: ['courtyard/legacy'] } }, user: { github: 'testuser' } }
      )

      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('PR in courtyard/current')
    } finally {
      if (original) mockRequest.mockImplementation(original)
      else mockRequest.mockReset()
    }
  })
})
