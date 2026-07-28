import type { CollectedItem, DateRange } from './types.js'
import { loadConfig, getConfigDir } from './config.js'
import { getDb, insertCollections, insertReview } from './db.js'
import { LinearCollector } from './collectors/linear.js'
import { GitHubCollector } from './collectors/github.js'
import { SlackCollector } from './collectors/slack.js'
import { aggregate } from './aggregator.js'
import { generateSummary } from './summarizer.js'
import { renderReview } from './renderer.js'
import { join } from 'path'

export function getDateRange(period: string): DateRange {
  const now = new Date()
  const start = new Date(now)

  if (period === 'daily') {
    start.setHours(0, 0, 0, 0)
  } else if (period === 'weekly') {
    const day = start.getDay()
    const diff = start.getDate() - day + (day === 0 ? -6 : 1)
    start.setDate(diff)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'monthly') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  }

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

export async function generateReview(period: string, useAi: boolean): Promise<string> {
  const config = loadConfig()
  const range = getDateRange(period)
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

  const warnings: string[] = []
  const results = await Promise.allSettled(
    collectors.map(c => c.collect(range, config).catch((err: Error) => {
      const msg = `${c.name} collector failed: ${err.message}`
      console.error(msg)
      warnings.push(msg)
      return [] as CollectedItem[]
    }))
  )

  const items = aggregate(results.flatMap(r => r.status === 'fulfilled' ? r.value : []))

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
    collected_date: startStr
  }))
  insertCollections(db, rows)

  let aiSummary: string | undefined
  if (useAi) {
    aiSummary = await generateSummary(items, config, period)
  }

  const markdown = renderReview(items, period, dateLabel, aiSummary, warnings)

  insertReview(db, {
    period,
    date_start: startStr,
    date_end: endStr,
    raw_markdown: markdown,
    ai_summary: aiSummary ?? null
  })

  db.close()
  return markdown
}
