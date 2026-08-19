import type { FocusItem, FocusReport } from './types.js'

export type FocusFormat = 'markdown' | 'json'

export function renderFocusJson(report: FocusReport): string {
  return JSON.stringify(report, null, 2).replace(
    /[\u007f-\u009f]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[\r\n]+/g, ' ')
    .replace(/([\\[\]()*_`~])/g, '\\$1')
}

function safeHttpLink(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href.replace(/([\\()])/g, '\\$1')
  } catch {
    return null
  }
}

function renderItem(item: FocusItem, index: number): string[] {
  const escapedTitle = escapeMarkdownText(item.title)
  const link = safeHttpLink(item.url)
  const title = link ? `[${escapedTitle}](${link})` : escapedTitle
  const details = [
    `${index + 1}. ${title}`,
    `   - Status: ${escapeMarkdownText(item.status ?? 'unknown')} · Age: ${item.ageDays}d`,
    `   - Why: ${escapeMarkdownText(item.explanation)}`
  ]
  if (item.nextAction) details.push(`   - Next action: ${escapeMarkdownText(item.nextAction)}`)
  if (item.closureRoute) details.push(`   - Closure route: ${escapeMarkdownText(item.closureRoute)}`)
  return details
}

function renderSection(lines: string[], heading: string, items: FocusItem[]): void {
  if (!items.length) return
  lines.push(`## ${heading}`, '')
  items.forEach((item, index) => lines.push(...renderItem(item, index), ''))
}

export function renderFocusMarkdown(report: FocusReport): string {
  const lines = [
    `# Engineering Focus — ${report.date}`,
    '',
    `_Revision ${report.revision} · Generated ${report.generatedAt} · ${report.timezone}_`,
    ''
  ]

  renderSection(lines, 'Primary Focus', report.primaryFocus)
  renderSection(lines, 'Close Today', report.closeToday)
  renderSection(lines, 'Reviews', report.reviews)
  renderSection(lines, 'Follow-ups', report.followUps)
  renderSection(lines, 'Blocked', report.blocked)
  renderSection(lines, 'Avoid Starting', report.avoidStarting)

  if (report.warnings.length) {
    lines.push('## Warnings', '', ...report.warnings.map(warning => `- ${escapeMarkdownText(warning)}`), '')
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function renderFocus(report: FocusReport, format: FocusFormat): string {
  return format === 'json' ? renderFocusJson(report) : renderFocusMarkdown(report)
}
