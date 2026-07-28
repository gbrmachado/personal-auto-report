import { describe, it, expect, vi } from 'vitest'

const { mockSearch } = vi.hoisted(() => ({
  mockSearch: vi.fn().mockResolvedValue({
    data: {
      items: [
        { id: 1, title: 'My PR', html_url: 'https://github.com/foo/bar/pull/1', state: 'open', updated_at: '2026-07-27T10:00:00Z', body: 'desc', repository_url: 'https://api.github.com/repos/foo/bar' }
      ]
    }
  })
}))

vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    search: { issuesAndPullRequests: mockSearch }
  }))
}))

import { GitHubCollector } from '../../src/collectors/github.js'

describe('GitHubCollector', () => {
  it('returns PRs created and reviewed', async () => {
    const collector = new GitHubCollector()
    const items = await collector.collect(
      { start: new Date('2026-07-27'), end: new Date('2026-07-27') },
      { github: { token: 'test' }, user: { github: 'testuser' } }
    )
    expect(items).toHaveLength(2)
    expect(items[0].type).toBe('pr_created')
    expect(items[1].type).toBe('pr_reviewed')
  })
})
