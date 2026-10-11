import type { Settings } from '@shared/schemas/settings'
import type { DB } from '../db/connection'
import type { SettingsStore } from '../services/settings'

/** Key/value settings in SQLite. Unknown keys are kept, so older versions stay compatible. */
export class SqliteSettingsStore implements SettingsStore {
  constructor(private readonly db: DB) {}

  load(): Partial<Settings> {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string
      value: string
    }>
    const out: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value)
      } catch {
        // Ignore corrupt values; defaults apply.
      }
    }
    return out as Partial<Settings>
  }

  save(settings: Settings): void {
    const stmt = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) stmt.run(key, JSON.stringify(value))
    })()
  }

  getRaw(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row?.value
  }

  setRaw(key: string, value: string | null): void {
    if (value === null) this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
    else
      this.db
        .prepare(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        )
        .run(key, value)
  }
}
