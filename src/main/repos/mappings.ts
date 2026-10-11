import { columnMappingSchema, type ColumnMapping } from '@shared/import/fields'
import type { DB } from '../db/connection'

export class MappingsRepo {
  constructor(private readonly db: DB) {}

  get(signature: string): ColumnMapping | null {
    const row = this.db
      .prepare('SELECT mapping FROM column_mappings WHERE signature = ?')
      .get(signature) as { mapping: string } | undefined
    if (!row) return null
    const parsed = columnMappingSchema.safeParse(JSON.parse(row.mapping))
    return parsed.success ? parsed.data : null
  }

  save(signature: string, mapping: ColumnMapping): void {
    this.db
      .prepare(
        `INSERT INTO column_mappings (signature, mapping, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(signature) DO UPDATE SET mapping = excluded.mapping, updated_at = excluded.updated_at`,
      )
      .run(signature, JSON.stringify(mapping), new Date().toISOString())
  }
}
