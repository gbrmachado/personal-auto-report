import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'fs'
import { dirname } from 'path'

export interface CollectionRow {
  id: string
  source: string
  type: string
  title: string
  url: string | null
  status: string | null
  timestamp: string
  description: string | null
  metadata: string | null
  collected_date: string
}

export interface StatusHistoryRow {
  id: string
  item_id: string
  source: string
  from_status: string | null
  to_status: string
  changed_at: string
}

export interface ReviewRow {
  id: number
  period: string
  date_start: string
  date_end: string
  raw_markdown: string
  ai_summary: string | null
  created_at: string
}

export function getDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      status TEXT,
      timestamp TEXT NOT NULL,
      description TEXT,
      metadata TEXT,
      collected_date TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL,
      date_start TEXT NOT NULL,
      date_end TEXT NOT NULL,
      raw_markdown TEXT NOT NULL,
      ai_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS status_history (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      source TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collected_date);
    CREATE INDEX IF NOT EXISTS idx_reviews_period ON reviews(period, date_start);
    CREATE INDEX IF NOT EXISTS idx_status_history_item ON status_history(item_id);
  `)
  return db
}

export function insertCollections(db: Database.Database, items: CollectionRow[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO collections (id, source, type, title, url, status, timestamp, description, metadata, collected_date)
    VALUES (@id, @source, @type, @title, @url, @status, @timestamp, @description, @metadata, @collected_date)
  `)
  const tx = db.transaction((items: CollectionRow[]) => {
    for (const item of items) stmt.run(item)
  })
  tx(items)
}

export function insertStatusHistory(db: Database.Database, rows: StatusHistoryRow[]): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO status_history (id, item_id, source, from_status, to_status, changed_at)
    VALUES (@id, @item_id, @source, @from_status, @to_status, @changed_at)
  `)
  const tx = db.transaction((rows: StatusHistoryRow[]) => {
    for (const row of rows) stmt.run(row)
  })
  tx(rows)
}

export function getCollectionsInRange(db: Database.Database, start: string, end: string): CollectionRow[] {
  return db.prepare(
    'SELECT * FROM collections WHERE collected_date >= ? AND collected_date <= ? ORDER BY timestamp ASC'
  ).all(start, end) as CollectionRow[]
}

export function insertReview(db: Database.Database, review: Omit<ReviewRow, 'id' | 'created_at'>): number {
  const result = db.prepare(
    'INSERT INTO reviews (period, date_start, date_end, raw_markdown, ai_summary) VALUES (?, ?, ?, ?, ?)'
  ).run(review.period, review.date_start, review.date_end, review.raw_markdown, review.ai_summary)
  return result.lastInsertRowid as number
}

export function getReviewsInRange(db: Database.Database, period: string, dateStart: string, dateEnd: string): ReviewRow[] {
  return db.prepare(
    'SELECT * FROM reviews WHERE period = ? AND date_start >= ? AND date_end <= ? ORDER BY created_at DESC'
  ).all(period, dateStart, dateEnd) as ReviewRow[]
}
