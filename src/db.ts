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
    CREATE INDEX IF NOT EXISTS idx_collections_date ON collections(collected_date);
    CREATE INDEX IF NOT EXISTS idx_reviews_period ON reviews(period, date_start);
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
