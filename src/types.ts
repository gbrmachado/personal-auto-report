export interface StatusChange {
  from: string | null
  to: string
  changedAt: Date
}

export interface CollectedItem {
  id: string
  source: 'linear' | 'github' | 'slack'
  type: 'task' | 'pr_created' | 'pr_reviewed' | 'pr_assigned' | 'slack_message'
  title: string
  url: string | null
  status: string | null
  timestamp: Date
  description: string | null
  metadata: Record<string, unknown> | null
  statusHistory?: StatusChange[] | null
}

export interface DateRange {
  start: Date
  end: Date
}

export interface CrossRef {
  sourceItemId: string
  targetItemId: string
  relationType: 'mentioned_in' | 'implements'
  context: string
}
