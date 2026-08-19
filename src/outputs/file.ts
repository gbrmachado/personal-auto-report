import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { renderFocus, type FocusFormat } from '../focus/renderers.js'
import type { FocusReport } from '../focus/types.js'
import type { DeliveryReceipt, OutputAdapter } from './types.js'

export class FileOutput implements OutputAdapter {
  readonly name = 'file'

  constructor(
    private readonly target: string,
    private readonly format: FocusFormat = 'markdown'
  ) {}

  async deliver(report: FocusReport): Promise<DeliveryReceipt> {
    await mkdir(dirname(this.target), { recursive: true })
    await writeFile(this.target, renderFocus(report, this.format), 'utf8')
    return {
      adapter: this.name,
      eventId: report.id,
      deliveredAt: new Date().toISOString(),
      target: this.target
    }
  }
}
