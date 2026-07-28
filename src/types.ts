export interface CollectedItem {
  id: string
  source: 'linear' | 'github' | 'slack'
  type: 'task' | 'pr_created' | 'pr_reviewed' | 'slack_message'
  title: string
  url: string | null
  status: string | null
  timestamp: Date
  description: string | null
  metadata: Record<string, unknown> | null
}

export interface DateRange {
  start: Date
  end: Date
}
