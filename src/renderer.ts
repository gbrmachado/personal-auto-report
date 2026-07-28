import type { CollectedItem } from './types.js'
import { groupByType } from './aggregator.js'

export function renderReview(
  items: CollectedItem[],
  period: string,
  dateLabel: string,
  aiSummary?: string,
  warnings?: string[]
): string {
  const lines: string[] = []
  const heading = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly'

  lines.push(`# ${heading} Review — ${dateLabel}`)
  lines.push('')

  if (aiSummary) {
    lines.push('## AI Summary')
    lines.push('')
    lines.push(aiSummary)
    lines.push('')
  }

  const byType = groupByType(items)

  if (byType.task?.length) {
    lines.push('## Linear Tasks')
    lines.push('| Title | Status | Link |')
    lines.push('|-------|--------|------|')
    for (const item of byType.task) {
      lines.push(`| ${item.title} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  if (byType.pr_created?.length) {
    lines.push('## Pull Requests — Created')
    lines.push('| Title | Repo | Status | Link |')
    lines.push('|-------|------|--------|------|')
    for (const item of byType.pr_created) {
      const repo = (item.metadata?.repo as string) ?? '-'
      lines.push(`| ${item.title} | ${repo} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  if (byType.pr_reviewed?.length) {
    lines.push('## Pull Requests — Reviewed')
    lines.push('| Title | Repo | Status | Link |')
    lines.push('|-------|------|--------|------|')
    for (const item of byType.pr_reviewed) {
      const repo = (item.metadata?.repo as string) ?? '-'
      lines.push(`| ${item.title} | ${repo} | ${item.status ?? '-'} | ${item.url ?? '-'} |`)
    }
    lines.push('')
  }

  if (byType.slack_message?.length) {
    lines.push('## Slack Highlights')
    lines.push('')
    if (aiSummary) {
      lines.push('_See AI summary above for details._')
    } else {
      for (const item of byType.slack_message) {
        const channel = (item.metadata?.channel as string) ?? 'unknown'
        lines.push(`- [#${channel}] ${item.title}`)
      }
    }
    lines.push('')
  }

  if (warnings?.length) {
    lines.push('## Warnings')
    for (const w of warnings) lines.push(`- ${w}`)
    lines.push('')
  }

  lines.push('---')
  lines.push(`*Raw data collected from Linear, GitHub, Slack on ${new Date().toISOString()}*`)
  lines.push('')

  return lines.join('\n')
}
