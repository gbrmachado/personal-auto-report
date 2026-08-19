import { renderFocus, type FocusFormat } from '../focus/renderers.js'
import type { FocusReport } from '../focus/types.js'
import type { DeliveryReceipt, OutputAdapter } from './types.js'

export class StdoutOutput implements OutputAdapter {
  readonly name = 'stdout'

  constructor(
    private readonly format: FocusFormat = 'markdown',
    private readonly write: (content: string) => void = content => process.stdout.write(content)
  ) {}

  async deliver(report: FocusReport): Promise<DeliveryReceipt> {
    this.write(renderFocus(report, this.format))
    return {
      adapter: this.name,
      eventId: report.id,
      deliveredAt: new Date().toISOString()
    }
  }
}
