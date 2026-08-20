import { describe, it, expect, afterEach } from 'vitest'
import { rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getDb, insertCollections, getCollectionsInRange, insertReview, getReviewsInRange, insertStatusHistory } from '../src/db.js'

describe('db', () => {
  const testDir = join(tmpdir(), 'review-test-' + Date.now())
  const testDbPath = join(testDir, 'test.db')

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true })
  })

  it('creates tables on initialization', () => {
    const db = getDb(testDbPath)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    expect(tables.map(t => t.name)).toContain('collections')
    expect(tables.map(t => t.name)).toContain('reviews')
    expect(tables.map(t => t.name)).toContain('status_history')
    db.close()
  })

  it('inserts and retrieves collections', () => {
    const db = getDb(testDbPath)
    const item = {
      id: 'test-1', source: 'linear', type: 'task',
      title: 'Test task', url: 'https://linear.app/test',
      status: 'done', timestamp: '2026-07-27T10:00:00Z',
      description: null, metadata: null, collected_date: '2026-07-27'
    }
    insertCollections(db, [item])
    const rows = getCollectionsInRange(db, '2026-07-27', '2026-07-27')
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Test task')
    db.close()
  })

  it('inserts and retrieves reviews', () => {
    const db = getDb(testDbPath)
    const reviewId = insertReview(db, {
      period: 'daily',
      date_start: '2026-07-27',
      date_end: '2026-07-27',
      raw_markdown: '# Test',
      ai_summary: null
    })
    expect(reviewId).toBeGreaterThan(0)
    const reviews = getReviewsInRange(db, 'daily', '2026-07-27', '2026-07-27')
    expect(reviews).toHaveLength(1)
    expect(reviews[0].raw_markdown).toBe('# Test')
    db.close()
  })

  it('inserts status history rows and dedupes on re-insert', () => {
    const db = getDb(testDbPath)
    const row = {
      id: 'test-1-0', item_id: 'test-1', source: 'linear',
      from_status: 'Todo', to_status: 'In Progress', changed_at: '2026-07-27T10:00:00Z'
    }
    insertStatusHistory(db, [row])
    insertStatusHistory(db, [row])
    const rows = db.prepare('SELECT * FROM status_history WHERE item_id = ?').all('test-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject(row)
    db.close()
  })
})
