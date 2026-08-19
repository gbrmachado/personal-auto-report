import type { FocusReport } from '../focus/types.js'

export interface DeliveryReceipt {
  adapter: string
  eventId: string
  deliveredAt: string
  target?: string
}

export interface OutputAdapter {
  readonly name: string
  deliver(report: FocusReport): Promise<DeliveryReceipt>
}
