import type { CollectedItem, DateRange } from './types.js'

export interface Collector {
  readonly name: string
  collect(range: DateRange, config: any): Promise<CollectedItem[]>
}
