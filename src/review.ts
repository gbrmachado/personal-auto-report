import type { CollectedItem, DateRange } from './types.js'
import type { Collector } from './collector.js'
import type { Config } from './config.js'
import { loadConfig, getConfigDir } from './config.js'
import { getDb, insertCollections, insertReview, insertStatusHistory } from './db.js'
import { LinearCollector } from './collectors/linear.js'
import { GitHubCollector } from './collectors/github.js'
import { SlackCollector } from './collectors/slack.js'
import { aggregate } from './aggregator.js'
import { generateSummary } from './summarizer.js'
import { renderReview } from './renderer.js'
import { crossReference } from './crossref.js'
import { join } from 'path'

export function parseDateInput(input: string, defaultTime: 'start' | 'end'): Date {
  if (input.includes('T')) return new Date(input)
  const date = new Date(input + (defaultTime === 'start' ? 'T00:00:00' : 'T23:59:59'))
  return date
}

export function getDateRange(period: string, fromDate?: string, toDate?: string): DateRange {
  const now = toDate ? parseDateInput(toDate, 'end') : new Date()

  let start: Date
  if (fromDate) {
    start = parseDateInput(fromDate, 'start')
  } else {
    start = new Date(now)
    if (period === 'daily') {
      start.setHours(0, 0, 0, 0)
    } else if (period === 'weekly') {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
      start.setHours(0, 0, 0, 0)
    } else if (period === 'monthly') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
    }
  }

  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  if (start < sevenDaysAgo) start = sevenDaysAgo

  return { start, end: now }
}

export function formatDateLabel(range: DateRange, period: string): string {
  if (period === 'daily') return range.start.toISOString().split('T')[0]
  if (period === 'weekly') {
    const endStr = range.end.toISOString().split('T')[0]
    const startStr = range.start.toISOString().split('T')[0]
    return `${startStr} - ${endStr}`
  }
  return range.start.toLocaleString('default', { month: 'long', year: 'numeric' })
}

export async function collectFresh(
  collectors: Collector[],
  range: DateRange,
  config: Config
): Promise<{ items: CollectedItem[]; warnings: string[] }> {
  const results = await Promise.allSettled(collectors.map(collector => collector.collect(range, config)))
  const warnings: string[] = []
  const items: CollectedItem[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      items.push(...result.value)
      return
    }

    const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
    warnings.push(`${collectors[index].name} collector failed: ${message}`)
  })

  return { items: aggregate(items), warnings }
}

export async function generateReview(period: string, useAi: boolean, fromDate?: string, toDate?: string): Promise<string> {
  const config = loadConfig()
  const range = getDateRange(period, fromDate, toDate)
  const dateLabel = formatDateLabel(range, period)
  const dbPath = config.db.path || join(getConfigDir(), 'review.db')
  const db = getDb(dbPath)

  const startStr = range.start.toISOString().split('T')[0]
  const endStr = range.end.toISOString().split('T')[0]

  // Always fetch fresh data
  const collectors = [
    new LinearCollector(),
    new GitHubCollector(),
    new SlackCollector()
  ]

  const { items, warnings } = await collectFresh(collectors, range, config)
  const crossRefs = crossReference(items)

  // Store in DB for historical queries
  const rows = items.map(item => ({
    id: item.id,
    source: item.source,
    type: item.type,
    title: item.title,
    url: item.url,
    status: item.status,
    timestamp: item.timestamp.toISOString(),
    description: item.description,
    metadata: item.metadata ? JSON.stringify(item.metadata) : null,
    collected_date: item.timestamp.toISOString().split('T')[0]
  }))
  insertCollections(db, rows)

  const statusHistoryRows = items.flatMap(item =>
    (item.statusHistory ?? []).map((change, index) => ({
      id: `${item.id}-${index}`,
      item_id: item.id,
      source: item.source,
      from_status: change.from,
      to_status: change.to,
      changed_at: change.changedAt.toISOString()
    }))
  )
  insertStatusHistory(db, statusHistoryRows)

  let aiSummary: string | undefined
  if (useAi) {
    try {
      aiSummary = await generateSummary(items, config, period)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      warnings.push(`AI summary failed: ${message}`)
      console.error(`AI summary failed: ${message}`)
    }
  }

  try {
    const groupBy = config.display?.groupBy ?? 'none'
    const markdown = renderReview(items, period, dateLabel, aiSummary, warnings, crossRefs, groupBy)

    insertReview(db, {
      period,
      date_start: startStr,
      date_end: endStr,
      raw_markdown: markdown,
      ai_summary: aiSummary ?? null
    })

    return markdown
  } finally {
    db.close()
  }
}
