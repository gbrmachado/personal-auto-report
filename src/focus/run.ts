import type { Config } from '../config.js'
import { PriorityEngine, type PriorityResult } from '../priority.js'
import type { OutputAdapter, DeliveryReceipt } from '../outputs/types.js'
import { buildFocusReport, validateFocusOptions } from './engine.js'
import type { FocusOptions } from './types.js'

export interface PriorityCollector {
  collect(config: Config): Promise<PriorityResult>
}

export async function runFocus(
  config: Config,
  output: OutputAdapter,
  options: FocusOptions = {},
  collector: PriorityCollector = new PriorityEngine()
): Promise<DeliveryReceipt> {
  validateFocusOptions(options)
  const priorities = await collector.collect(config)
  const report = buildFocusReport(priorities, options)
  return output.deliver(report)
}
