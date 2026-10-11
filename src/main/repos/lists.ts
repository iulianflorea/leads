import type { ListSummary } from '@shared/schemas/lead'
import { AppError } from '@shared/errors'
import type { DB } from '../db/connection'

export class ListsRepo {
  constructor(private readonly db: DB) {}

  all(): ListSummary[] {
    return this.db
      .prepare(
        `SELECT l.id, l.name, l.created_at AS createdAt,
                (SELECT COUNT(*) FROM leads WHERE list_id = l.id AND deleted_at IS NULL) AS leadCount
         FROM lists l ORDER BY l.created_at DESC`,
      )
      .all() as ListSummary[]
  }

  create(name: string): number {
    return Number(
      this.db.prepare('INSERT INTO lists (name) VALUES (?)').run(name.trim()).lastInsertRowid,
    )
  }

  rename(id: number, name: string): void {
    const r = this.db.prepare('UPDATE lists SET name = ? WHERE id = ?').run(name.trim(), id)
    if (r.changes === 0) throw new AppError('notFound', 'list')
  }

  /** Deletes the list; its leads are soft-deleted too when `withLeads` is set, otherwise kept unassigned. */
  delete(id: number, withLeads: boolean): void {
    this.db.transaction(() => {
      if (withLeads) {
        this.db
          .prepare('UPDATE leads SET deleted_at = ? WHERE list_id = ? AND deleted_at IS NULL')
          .run(new Date().toISOString(), id)
      }
      this.db.prepare('DELETE FROM lists WHERE id = ?').run(id)
    })()
  }
}
