import { describe, expect, it } from 'vitest'
import { buildFocusReport } from '../src/focus/engine.js'
import type { GitHubPriorityItem, LinearPriorityItem, PriorityResult } from '../src/priority.js'

const NOW = new Date('2026-08-20T12:00:00.000Z')

function item(
  id: string,
  status: string,
  updatedAt: string,
  priority?: number
): LinearPriorityItem {
  return {
    id,
    source: 'linear',
    type: 'task',
    title: id,
    url: `https://linear.app/${id}`,
    status,
    timestamp: new Date(updatedAt),
    description: null,
    metadata: priority === undefined ? null : { priority }
  }
}

describe('buildFocusReport', () => {
  it('selects a bounded daily focus and explains the ordering', () => {
    const result: PriorityResult = {
      linear: [
        item('regular-todo', 'Todo', '2026-08-15T12:00:00.000Z', 3),
        item('active-high', 'In Progress', '2026-08-19T12:00:00.000Z', 2),
        item('near-closure', 'In Review', '2026-08-14T12:00:00.000Z', 3),
        item('urgent-todo', 'Todo', '2026-08-20T10:00:00.000Z', 1)
      ],
      staleCreated: [],
      pendingReview: []
    }

    const report = buildFocusReport(result, {
      now: NOW,
      timezone: 'UTC',
      maxPrimaryItems: 3,
      staleAfterDays: 3
    })

    expect(report.date).toBe('2026-08-20')
    expect(report.generatedAt).toBe(NOW.toISOString())
    expect(report.primaryFocus.map(i => i.id)).toEqual([
      'urgent-todo',
      'near-closure',
      'active-high'
    ])
    expect(report.primaryFocus[0].reasonCodes).toContain('URGENT_PRIORITY')
    expect(report.primaryFocus[0].explanation).toContain('Urgent priority')
    expect(report.primaryFocus[1].reasonCodes).toContain('NEAR_CLOSURE')
    expect(report.primaryFocus[1].reasonCodes).toContain('STALE_ACTIVITY')
    expect(report.primaryFocus[2].reasonCodes).toContain('HIGH_PRIORITY')
    expect(report.avoidStarting.map(i => i.id)).toEqual(['regular-todo'])
  })

  it('separates closure work and requested reviews from primary implementation work', () => {
    const stalePr: GitHubPriorityItem = {
      ...item('stale-pr', 'open', '2026-08-01T12:00:00.000Z'),
      source: 'github' as const,
      type: 'pr_created' as const,
      metadata: { updatedAt: '2026-08-17T12:00:00.000Z' }
    }
    const requestedReview: GitHubPriorityItem = {
      ...item('requested-review', 'open', '2026-08-10T12:00:00.000Z'),
      source: 'github' as const,
      type: 'pr_reviewed' as const,
      metadata: { author: 'teammate' }
    }
    const result: PriorityResult = {
      linear: [item('near-closure', 'In Review', '2026-08-18T12:00:00.000Z')],
      staleCreated: [stalePr],
      pendingReview: [requestedReview]
    }

    const report = buildFocusReport(result, { now: NOW, timezone: 'UTC' })

    expect(report.primaryFocus.map(i => i.id)).toEqual(['near-closure'])
    expect(report.closeToday.map(i => i.id)).toEqual(['stale-pr'])
    expect(report.closeToday[0]).toMatchObject({
      ageDays: 3, lastEvidenceAt: '2026-08-17T12:00:00.000Z'
    })
    expect(report.reviews.map(i => i.id)).toEqual(['requested-review'])
    expect(report.reviews[0].reasonCodes).toContain('REVIEW_REQUESTED')
    expect(report.reviews[0].nextAction).toBe('Review the PR or reassign it')
  })

  it('orders equivalent input sets deterministically', () => {
    const sameTime = '2026-08-18T12:00:00.000Z'
    const linearA = item('linear-a', 'Todo', sameTime, 3)
    const linearB = item('linear-b', 'Todo', sameTime, 3)
    const staleA: GitHubPriorityItem = { ...item('pr-a', 'open', sameTime), source: 'github', type: 'pr_created' }
    const staleB: GitHubPriorityItem = { ...item('pr-b', 'open', sameTime), source: 'github', type: 'pr_created' }
    const reviewA: GitHubPriorityItem = { ...item('review-a', 'open', sameTime), source: 'github', type: 'pr_reviewed' }
    const reviewB: GitHubPriorityItem = { ...item('review-b', 'open', sameTime), source: 'github', type: 'pr_reviewed' }

    const forward = buildFocusReport({
      linear: [linearB, linearA], staleCreated: [staleB, staleA], pendingReview: [reviewB, reviewA]
    }, { now: NOW, timezone: 'UTC', maxPrimaryItems: 2 })
    const reverse = buildFocusReport({
      linear: [linearA, linearB], staleCreated: [staleA, staleB], pendingReview: [reviewA, reviewB]
    }, { now: NOW, timezone: 'UTC', maxPrimaryItems: 2 })

    expect(forward.primaryFocus.map(i => i.id)).toEqual(['linear-a', 'linear-b'])
    expect(forward.closeToday.map(i => i.id)).toEqual(['pr-a', 'pr-b'])
    expect(forward.reviews.map(i => i.id)).toEqual(['review-a', 'review-b'])
    expect(forward).toEqual(reverse)
  })

  it('does not duplicate a linear item into closeToday when it is already in primaryFocus', () => {
    const result: PriorityResult = {
      linear: [
        item('urgent-in-review', 'In Review', '2026-08-19T12:00:00.000Z', 1),
        item('other-in-review', 'In Review', '2026-08-10T12:00:00.000Z', 3)
      ],
      staleCreated: [],
      pendingReview: []
    }

    const report = buildFocusReport(result, {
      now: NOW, timezone: 'UTC', maxPrimaryItems: 1
    })

    expect(report.primaryFocus.map(i => i.id)).toEqual(['urgent-in-review'])
    expect(report.closeToday.map(i => i.id)).toEqual(['other-in-review'])
  })
})
