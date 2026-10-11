import type { Template } from '@shared/schemas/template'
import { AppError } from '@shared/errors'
import type { DB } from '../db/connection'

interface Raw {
  id: number
  name: string
  subject: string
  body_html: string
  is_default: number
  created_at: string
  updated_at: string
}

const toTemplate = (r: Raw): Template => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  bodyHtml: r.body_html,
  isDefault: !!r.is_default,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
})

export class TemplatesRepo {
  constructor(private readonly db: DB) {}

  all(): Template[] {
    return (
      this.db
        .prepare('SELECT * FROM templates ORDER BY is_default DESC, updated_at DESC')
        .all() as Raw[]
    ).map(toTemplate)
  }

  get(id: number): Template {
    const row = this.db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as Raw | undefined
    if (!row) throw new AppError('notFound', 'template')
    return toTemplate(row)
  }

  create(input: { name: string; subject: string; bodyHtml: string }): number {
    const isFirst =
      (this.db.prepare('SELECT COUNT(*) FROM templates').pluck().get() as number) === 0
    return Number(
      this.db
        .prepare('INSERT INTO templates (name, subject, body_html, is_default) VALUES (?, ?, ?, ?)')
        .run(input.name, input.subject, input.bodyHtml, isFirst ? 1 : 0).lastInsertRowid,
    )
  }

  update(id: number, patch: { name?: string; subject?: string; bodyHtml?: string }): Template {
    const current = this.get(id)
    this.db
      .prepare(
        'UPDATE templates SET name = ?, subject = ?, body_html = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        patch.name ?? current.name,
        patch.subject ?? current.subject,
        patch.bodyHtml ?? current.bodyHtml,
        new Date().toISOString(),
        id,
      )
    return this.get(id)
  }

  delete(id: number): void {
    this.db.transaction(() => {
      const wasDefault = this.get(id).isDefault
      this.db.prepare('DELETE FROM templates WHERE id = ?').run(id)
      if (wasDefault) {
        this.db
          .prepare(
            'UPDATE templates SET is_default = 1 WHERE id = (SELECT id FROM templates ORDER BY updated_at DESC LIMIT 1)',
          )
          .run()
      }
    })()
  }

  setDefault(id: number): void {
    this.db.transaction(() => {
      this.get(id)
      this.db
        .prepare('UPDATE templates SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END')
        .run(id)
    })()
  }
}
