export type FocusReasonCode =
  | 'URGENT_PRIORITY'
  | 'HIGH_PRIORITY'
  | 'NEAR_CLOSURE'
  | 'ACTIVE_WORK'
  | 'START_CANDIDATE'
  | 'STALE_ACTIVITY'
  | 'STALE_PR'
  | 'REVIEW_REQUESTED'

export interface FocusItem {
  source: 'linear' | 'github' | 'report'
  id: string
  title: string
  url: string | null
  status: string | null
  priority: number | null
  reasonCodes: FocusReasonCode[]
  explanation: string
  nextAction: string | null
  closureRoute: string | null
  lastEvidenceAt: string
  ageDays: number
}

export interface FocusReport {
  id: string
  date: string
  revision: number
  generatedAt: string
  timezone: string
  primaryFocus: FocusItem[]
  closeToday: FocusItem[]
  reviews: FocusItem[]
  followUps: FocusItem[]
  blocked: FocusItem[]
  avoidStarting: FocusItem[]
  warnings: string[]
}

export interface FocusOptions {
  now?: Date
  timezone?: string
  maxPrimaryItems?: number
  staleAfterDays?: number
}
