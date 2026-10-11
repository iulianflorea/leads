import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { bundledMigrations, migrate } from '../../src/main/db/migrate'

describe('migrations', () => {
  it('discovers numbered SQL files in order', () => {
    const list = bundledMigrations()
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]!.version).toBe(1)
    expect(list.map((m) => m.version)).toEqual(
      [...list.map((m) => m.version)].sort((a, b) => a - b),
    )
  })

  it('applies all migrations once and is idempotent', () => {
    const db = new Database(':memory:')
    const first = migrate(db)
    expect(first.length).toBe(bundledMigrations().length)
    expect(migrate(db)).toEqual([])
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining(['leads', 'lists', 'products', 'templates', 'sends', 'send_jobs']),
    )
  })

  it('rolls back a failing migration and keeps the version', () => {
    const db = new Database(':memory:')
    expect(() =>
      migrate(db, [
        { version: 1, name: 'ok', sql: 'CREATE TABLE a (id INTEGER);' },
        { version: 2, name: 'broken', sql: 'CREATE TABLE b (id INTEGER); NOT SQL;' },
      ]),
    ).toThrow()
    expect(db.pragma('user_version', { simple: true })).toBe(1)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
  })
})
