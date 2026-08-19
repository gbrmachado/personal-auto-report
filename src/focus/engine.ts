import type { PriorityItem, PriorityResult } from '../priority.js'
import type { FocusItem, FocusOptions, FocusReasonCode, FocusReport } from './types.js'

const DAY_MS = 86_400_000

const REASON_LABELS: Record<FocusReasonCode, string> = {
  URGENT_PRIORITY: 'Urgent priority',
  HIGH_PRIORITY: 'High priority',
  NEAR_CLOSURE: 'Near closure',
  ACTIVE_WORK: 'Active work',
  START_CANDIDATE: 'Candidate to start',
  STALE_ACTIVITY: 'No recent evidence',
  STALE_PR: 'Stale pull request',
  REVIEW_REQUESTED: 'Review requested'
}

export function validateFocusOptions(options: FocusOptions = {}): void {
  if (options.now !== undefined &&
      (!(options.now instanceof Date) || Number.isNaN(options.now.getTime()))) {
    throw new Error('Invalid now: expected a valid Date')
  }

  const timezone = options.timezone ?? 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`)
  }

  if (options.maxPrimaryItems !== undefined &&
      (!Number.isInteger(options.maxPrimaryItems) || options.maxPrimaryItems < 1)) {
    throw new Error('maxPrimaryItems must be a positive integer')
  }
  if (options.staleAfterDays !== undefined &&
      (!Number.isInteger(options.staleAfterDays) || options.staleAfterDays < 1)) {
    throw new Error('staleAfterDays must be a positive integer')
  }
}

function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

function itemPriority(item: PriorityItem): number | null {
  const priority = item.metadata?.priority
  return typeof priority === 'number' ? priority : null
}

function evidenceDate(item: PriorityItem): Date {
  const updatedAt = item.metadata?.updatedAt
  if (typeof updatedAt === 'string') {
    const parsed = new Date(updatedAt)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return item.timestamp
}

function ageDays(item: PriorityItem, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - evidenceDate(item).getTime()) / DAY_MS))
}

function statusRank(item: PriorityItem): number {
  const priority = itemPriority(item)
  if (priority === 1) return 0

  switch (item.status?.toLowerCase()) {
    case 'in review': return 10
    case 'ready to merge': return 10
    case 'in progress': return 20
    case 'todo': return 30
    default: return 40
  }
}

function compareCandidates(a: PriorityItem, b: PriorityItem): number {
  const rank = statusRank(a) - statusRank(b)
  if (rank !== 0) return rank

  const priorityA = itemPriority(a) || Number.MAX_SAFE_INTEGER
  const priorityB = itemPriority(b) || Number.MAX_SAFE_INTEGER
  if (priorityA !== priorityB) return priorityA - priorityB

  const evidence = evidenceDate(a).getTime() - evidenceDate(b).getTime()
  if (evidence !== 0) return evidence

  const source = a.source.localeCompare(b.source)
  return source !== 0 ? source : a.id.localeCompare(b.id)
}

function suggestedNextAction(reasons: FocusReasonCode[]): string | null {
  if (reasons.includes('REVIEW_REQUESTED')) return 'Review the PR or reassign it'
  if (reasons.includes('STALE_PR')) return 'Advance, pause, or close the PR'
  if (reasons.includes('NEAR_CLOSURE')) return 'Complete the remaining review and merge steps'
  if (reasons.includes('URGENT_PRIORITY')) return 'Confirm scope and act on the urgent item'
  if (reasons.includes('ACTIVE_WORK')) return 'Continue the current work'
  return null
}

function toFocusItem(
  item: PriorityItem,
  now: Date,
  staleAfterDays: number,
  additionalReasons: FocusReasonCode[] = []
): FocusItem {
  const priority = itemPriority(item)
  const age = ageDays(item, now)
  const reasons: FocusReasonCode[] = [...additionalReasons]
  const status = item.status?.toLowerCase()

  if (priority === 1) reasons.push('URGENT_PRIORITY')
  if (priority === 2) reasons.push('HIGH_PRIORITY')
  if (status === 'in review' || status === 'ready to merge') reasons.push('NEAR_CLOSURE')
  if (status === 'in progress') reasons.push('ACTIVE_WORK')
  if (status === 'todo' || status === 'backlog') reasons.push('START_CANDIDATE')
  if (age >= staleAfterDays) reasons.push('STALE_ACTIVITY')

  const uniqueReasons = [...new Set(reasons)]
  return {
    source: item.source,
    id: item.id,
    title: item.title,
    url: item.url,
    status: item.status,
    priority,
    reasonCodes: uniqueReasons,
    explanation: uniqueReasons.map(reason => REASON_LABELS[reason]).join('; '),
    nextAction: suggestedNextAction(uniqueReasons),
    closureRoute: uniqueReasons.includes('NEAR_CLOSURE') ? 'merge → deploy → Done' : null,
    lastEvidenceAt: evidenceDate(item).toISOString(),
    ageDays: age
  }
}

export function buildFocusReport(
  result: PriorityResult,
  options: FocusOptions = {}
): FocusReport {
  validateFocusOptions(options)
  const now = options.now ?? new Date()
  const timezone = options.timezone ?? 'UTC'
  const maxPrimaryItems = options.maxPrimaryItems ?? 3
  const staleAfterDays = options.staleAfterDays ?? 3
  const date = dateInTimezone(now, timezone)
  const candidates = [...result.linear].sort(compareCandidates)
  const primary = candidates.slice(0, maxPrimaryItems)
  const selectedIds = new Set(primary.map(item => item.id))

  const closeLinear = result.linear.filter(item => {
    if (selectedIds.has(item.id)) return false
    const status = item.status?.toLowerCase()
    return status === 'in review' || status === 'ready to merge'
  })
  const closeCandidates = [...closeLinear, ...result.staleCreated].sort(compareCandidates)
  const reviewCandidates = [...result.pendingReview].sort(compareCandidates)

  return {
    id: `focus-${date}`,
    date,
    revision: 1,
    generatedAt: now.toISOString(),
    timezone,
    primaryFocus: primary.map(item => toFocusItem(item, now, staleAfterDays)),
    closeToday: closeCandidates.map(item =>
      toFocusItem(item, now, staleAfterDays,
        item.source === 'github' ? ['STALE_PR'] : [])
    ),
    reviews: reviewCandidates.map(item =>
      toFocusItem(item, now, staleAfterDays, ['REVIEW_REQUESTED'])
    ),
    followUps: [],
    blocked: [],
    avoidStarting: candidates
      .filter(item => !selectedIds.has(item.id))
      .filter(item => ['todo', 'backlog'].includes(item.status?.toLowerCase() ?? ''))
      .map(item => toFocusItem(item, now, staleAfterDays)),
    warnings: []
  }
}
