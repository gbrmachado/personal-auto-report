import type {
  GitHubPriorityItem,
  LinearPriorityItem,
  PriorityResult
} from '../src/priority.js'
import type { CollectedItem } from '../src/types.js'

type SlackItem = CollectedItem & { source: 'slack'; type: 'slack_message' }
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T

type LinearSourceIsRestricted = Expect<
  Equal<PriorityResult['linear'][number]['source'], 'linear'>
>
type LinearTypeIsRestricted = Expect<
  Equal<PriorityResult['linear'][number]['type'], 'task'>
>
type StaleCreatedSourceIsRestricted = Expect<
  Equal<PriorityResult['staleCreated'][number]['source'], 'github'>
>
type StaleCreatedTypeIsRestricted = Expect<
  Equal<
    PriorityResult['staleCreated'][number]['type'],
    'pr_created' | 'pr_reviewed' | 'pr_assigned'
  >
>
type PendingReviewSourceIsRestricted = Expect<
  Equal<PriorityResult['pendingReview'][number]['source'], 'github'>
>
type PendingReviewTypeIsRestricted = Expect<
  Equal<
    PriorityResult['pendingReview'][number]['type'],
    'pr_created' | 'pr_reviewed' | 'pr_assigned'
  >
>

const linearItem: LinearPriorityItem = {
  id: 'linear-ENG-1', source: 'linear', type: 'task', title: 'Linear task',
  url: null, status: 'In Progress', timestamp: new Date(),
  description: null, metadata: null
}
const githubItem: GitHubPriorityItem = {
  id: 'github-1', source: 'github', type: 'pr_created', title: 'GitHub PR',
  url: null, status: 'open', timestamp: new Date(),
  description: null, metadata: null
}
const slackItem: SlackItem = {
  id: 'slack-C123-1.000001', source: 'slack', type: 'slack_message',
  title: 'Slack mention', url: null, status: null, timestamp: new Date(),
  description: null, metadata: { channel: 'C123' }
}

const validPriorityResult: PriorityResult = {
  linear: [linearItem],
  staleCreated: [githubItem],
  pendingReview: [githubItem]
}
const invalidLinearResult: PriorityResult = {
  // @ts-expect-error Slack items are not valid Linear priority items.
  linear: [slackItem],
  staleCreated: [],
  pendingReview: []
}
const invalidStaleCreatedResult: PriorityResult = {
  linear: [],
  // @ts-expect-error Slack items are not valid stale GitHub PR items.
  staleCreated: [slackItem],
  pendingReview: []
}
const invalidPendingReviewResult: PriorityResult = {
  linear: [],
  staleCreated: [],
  // @ts-expect-error Slack items are not valid GitHub review items.
  pendingReview: [slackItem]
}

void validPriorityResult
void invalidLinearResult
void invalidStaleCreatedResult
void invalidPendingReviewResult

export type PriorityResultTypeAssertions =
  | LinearSourceIsRestricted
  | LinearTypeIsRestricted
  | StaleCreatedSourceIsRestricted
  | StaleCreatedTypeIsRestricted
  | PendingReviewSourceIsRestricted
  | PendingReviewTypeIsRestricted
