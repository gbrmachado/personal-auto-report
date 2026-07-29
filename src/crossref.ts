import type { CollectedItem, CrossRef } from './types.js'

const LINEAR_ID_RE = /[A-Z]{2,4}-\d+/gi

export function crossReference(items: CollectedItem[]): CrossRef[] {
  const linearItems = items.filter(i => i.source === 'linear')
  const crossRefs: CrossRef[] = []

  for (const item of items) {
    if (item.source === 'linear') continue

    const textToSearch = [item.title, item.description ?? ''].join(' ')
    const foundIds = [...new Set(
      (textToSearch.match(LINEAR_ID_RE) ?? []).map(id => id.toUpperCase())
    )]

    if (foundIds.length === 0) continue

    const matchedLinear = linearItems.filter(li => {
      const liId = (li.metadata?.identifier as string ?? '').toUpperCase()
      return foundIds.includes(liId)
    })

    for (const ml of matchedLinear) {
      crossRefs.push({
        sourceItemId: item.id,
        targetItemId: ml.id,
        relationType: item.source === 'github' ? 'implements' : 'mentioned_in',
        context: textToSearch.slice(0, 200)
      })
    }
  }

  return crossRefs
}
