import type { CollectedItem } from './types.js'

export function aggregate(items: CollectedItem[]): CollectedItem[] {
  return [...items].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

export function groupBySource(items: CollectedItem[]): Record<string, CollectedItem[]> {
  const groups: Record<string, CollectedItem[]> = {}
  for (const item of items) {
    if (!groups[item.source]) groups[item.source] = []
    groups[item.source].push(item)
  }
  return groups
}

export function groupByType(items: CollectedItem[]): Record<string, CollectedItem[]> {
  const groups: Record<string, CollectedItem[]> = {}
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = []
    groups[item.type].push(item)
  }
  return groups
}
