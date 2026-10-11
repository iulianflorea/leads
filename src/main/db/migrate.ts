import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  sql: string
}

/** Loads the numbered SQL files bundled from ./migrations (e.g. 001_init.sql). */
export function bundledMigrations(): Migration[] {
  const files = import.meta.glob<string>('./migrations/*.sql', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  return Object.entries(files)
    .map(([path, sql]) => {
      const file = path.split('/').pop() ?? path
      const match = /^(\d+)_(.+)\.sql$/.exec(file)
      if (!match) throw new Error(`Invalid migration file name: ${file}`)
      return { version: Number(match[1]), name: match[2]!, sql }
    })
    .sort((a, b) => a.version - b.version)
}

/**
 * Applies pending migrations in order, each in its own transaction.
 * The applied version is tracked with PRAGMA user_version.
 */
export function migrate(db: Database.Database, migrations = bundledMigrations()): number[] {
  const current = db.pragma('user_version', { simple: true }) as number
  const applied: number[] = []
  for (const m of migrations) {
    if (m.version <= current) continue
    db.transaction(() => {
      db.exec(m.sql)
      db.pragma(`user_version = ${m.version}`)
    })()
    applied.push(m.version)
  }
  return applied
}
