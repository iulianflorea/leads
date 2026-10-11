import Database from 'better-sqlite3'
import { migrate } from './migrate'

export type DB = Database.Database

export function openDatabase(file: string): DB {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('synchronous = NORMAL')
  migrate(db)
  return db
}

/** ISO timestamp matching the SQL default format. */
export function now(): string {
  return new Date().toISOString()
}
