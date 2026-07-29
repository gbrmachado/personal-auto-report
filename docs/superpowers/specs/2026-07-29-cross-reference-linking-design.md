# Cross-Reference Linking Between Sources

## Problem

The review report currently shows Linear, GitHub, and Slack items in siloed sections.
Slack messages about a Linear task, or PRs implementing one, are never connected.
The report lacks a "story" of how a task flows from creation to completion.

## Solution

Add a `crossref.ts` module that scans all collected items and links them by
matching Linear issue IDs (e.g. `ENG-1234`) against Slack message text and
PR titles/descriptions. The renderer uses these links for two outputs:

1. **Annotations** — a "Related" column in the Linear Tasks table (always shown)
2. **Narratives** — a per-task timeline section (only when `--ai`)

## Data Structure

```typescript
// src/types.ts — new type
export interface CrossRef {
  sourceItemId: string
  targetItemId: string
  relationType: 'mentioned_in' | 'implements'
  context: string
}
```

- `mentioned_in` — Slack message that references a Linear task ID
- `implements` — PR that references a Linear task ID (in title or description)

## New Module: src/crossref.ts

```typescript
export function crossReference(items: CollectedItem[]): CrossRef[]
```

Scans all items and matches:

1. **Slack messages** → extract `[A-Z]+-\d+` patterns from text → `mentioned_in`
2. **PR titles/descriptions** → extract `[A-Z]+-\d+` patterns → `implements`

Returns all matches. No side effects. Pure function.

## Changes to Existing Modules

### src/review.ts

After `collectFresh` returns items, call `crossReference(items)` and pass the
result through `generateReview` to renderer and summarizer.

### src/renderer.ts

- **Linear Tasks table**: add a "Related" column with icons + short context:
  - `💬 #channel` for Slack mentions
  - `🔀 #PR` for implementing PRs
- **New section "Task Narratives"** (only when `aiSummary` is present):
  - Per-task timeline combining all cross-refs sorted by timestamp
  - Format:
    ```
    ### ENG-1234 — Title
    - **Jul 29** — 🎯 Task created
    - **Jul 29** — 🔀 PR #42 opened
    - **Jul 29** — 💬 Discussed in #eng-deploy
    ```

### src/review.ts signature

```typescript
export async function generateReview(
  period: string,
  useAi: boolean,
  fromDate?: string,
  toDate?: string
): Promise<string>
```

No signature change — cross-refs computed internally.

## Test: src/crossref.ts

One test file `tests/crossref.test.ts` mirroring the module:

- Slack message with `ENG-1234` → returns `mentioned_in`
- PR title with `ENG-1234` → returns `implements`
- No matches → empty array
- Multiple matches from same message
- Case sensitivity (should match case-insensitive)

## Files Changed

| File | Change |
|------|--------|
| `src/types.ts` | Add `CrossRef` interface |
| `src/crossref.ts` | New module — `crossReference()` |
| `src/review.ts` | Call `crossReference()`, pipe result |
| `src/renderer.ts` | Related column + narratives section |
| `tests/crossref.test.ts` | New test file |
