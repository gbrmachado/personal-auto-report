import type { CollectedItem, DateRange } from './types.js'
import type { Config } from './config.js'

export interface Collector {
  readonly name: string
  collect(range: DateRange, config: Config): Promise<CollectedItem[]>
}
