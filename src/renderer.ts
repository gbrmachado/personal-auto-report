import type { CollectedItem, CrossRef } from './types.js'
import { groupByType } from './aggregator.js'

export function renderReview(
  items: CollectedItem[],
  period: string,
  dateLabel: string,
  aiSummary?: string,
  warnings?: string[],
  crossRefs: CrossRef[] = [],
  groupBy: 'project' | 'team' | 'none' = 'none'
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

  if (aiSummary && crossRefs.length > 0) {
    const linearItems = items.filter(i => i.source === 'linear')
    const hasNarratives = linearItems.some(li =>
      crossRefs.some(cr => cr.targetItemId === li.id)
    )

    if (hasNarratives) {
      lines.push('## Task Narratives')
      lines.push('')

      for (const li of linearItems) {
        const liCrossRefs = crossRefs.filter(cr => cr.targetItemId === li.id)
        if (liCrossRefs.length === 0) continue

        const identifier = (li.metadata?.identifier as string) ?? li.id
        lines.push(`### ${identifier} — ${li.title}`)
        lines.push('')

        // Task created event
        const createdLabel = li.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        lines.push(`- **${createdLabel}** — 🎯 Task created`)

        // Gather related source items sorted by timestamp
        const relatedItems = items.filter(i =>
          liCrossRefs.some(cr => cr.sourceItemId === i.id)
        ).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

        for (const ri of relatedItems) {
          const itemDateLabel = ri.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const cr = liCrossRefs.find(c => c.sourceItemId === ri.id)
          const ctx = cr?.context ? ` — ${cr.context}` : ''
          if (ri.source === 'github') {
            const repo = (ri.metadata?.repo as string) ?? ''
            lines.push(`- **${itemDateLabel}** — 🔀 PR opened (${repo})${ctx}`)
          } else if (ri.source === 'slack') {
            const channel = (ri.metadata?.channel as string) ?? 'channel'
            lines.push(`- **${itemDateLabel}** — 💬 Discussed in #${channel}${ctx}`)
          }
        }

        // Status event
        const statusLabel = li.status ?? 'completed'
        lines.push(`- ✅ ${statusLabel}`)
        lines.push('')
      }
    }
  }

  const byType = groupByType(items)

  if (byType.task?.length) {
    lines.push('## Linear Tasks')
    lines.push('')

    if (groupBy !== 'none') {
      const groups = new Map<string, CollectedItem[]>()
      for (const item of byType.task) {
        const key = String(item.metadata?.[groupBy] ?? 'Other')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(item)
      }
      for (const [groupName, groupItems] of groups) {
        lines.push(`### ${groupName}`)
        lines.push('| Title | Status | Related | Link |')
        lines.push('|-------|--------|---------|------|')
        for (const item of groupItems) {
          const related = crossRefs
            .filter(cr => cr.targetItemId === item.id)
            .map(cr => {
              if (cr.relationType === 'mentioned_in') return '💬 slack'
              if (cr.relationType === 'implements') return '🔀 pr'
              return cr.relationType
            })
            .join(', ') || '-'
          lines.push(`| ${item.title} | ${item.status ?? '-'} | ${related} | ${item.url ?? '-'} |`)
        }
        lines.push('')
      }
    } else {
      lines.push('| Title | Status | Related | Link |')
      lines.push('|-------|--------|---------|------|')
      for (const item of byType.task) {
        const related = crossRefs
          .filter(cr => cr.targetItemId === item.id)
          .map(cr => {
            if (cr.relationType === 'mentioned_in') return '💬 slack'
            if (cr.relationType === 'implements') return '🔀 pr'
            return cr.relationType
          })
          .join(', ') || '-'
        lines.push(`| ${item.title} | ${item.status ?? '-'} | ${related} | ${item.url ?? '-'} |`)
      }
      lines.push('')
    }
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

  if (byType.pr_assigned?.length) {
    lines.push('## Pull Requests — Assigned')
    lines.push('| Title | Repo | Status | Link |')
    lines.push('|-------|------|--------|------|')
    for (const item of byType.pr_assigned) {
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
