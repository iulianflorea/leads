import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { IgnoredValue, Product, ProductSynonym } from '@shared/schemas/product'
import { AppError } from '@shared/errors'
import { normalizeKey } from '@shared/matching/normalize'
import type { MatchableProduct } from '@shared/matching/products'
import type { DB } from '../db/connection'

interface RawProduct {
  id: number
  name: string
  active: number
  pdf_file: string | null
  pdf_name: string | null
  pdf_size: number | null
  created_at: string
  lead_count: number
}

export interface ProductPdf {
  productId: number
  productName: string
  file: string
  name: string
  size: number
}

export class ProductsRepo {
  constructor(
    private readonly db: DB,
    private readonly pdfDir: () => string,
  ) {}

  all(): Product[] {
    const rows = this.db
      .prepare(
        `SELECT p.*, (SELECT COUNT(DISTINCT lpv.lead_id) FROM lead_product_values lpv
                       JOIN leads l ON l.id = lpv.lead_id AND l.deleted_at IS NULL
                       WHERE lpv.product_id = p.id) AS lead_count
         FROM products p ORDER BY p.name COLLATE NOCASE`,
      )
      .all() as RawProduct[]
    const synonyms = this.db
      .prepare('SELECT id, product_id, value FROM product_synonyms ORDER BY value COLLATE NOCASE')
      .all() as Array<ProductSynonym & { product_id: number }>
    const byProduct = new Map<number, ProductSynonym[]>()
    for (const s of synonyms) {
      const list = byProduct.get(s.product_id) ?? []
      list.push({ id: s.id, value: s.value })
      byProduct.set(s.product_id, list)
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      active: !!r.active,
      synonyms: byProduct.get(r.id) ?? [],
      pdf:
        r.pdf_file && r.pdf_name
          ? {
              name: r.pdf_name,
              size: r.pdf_size ?? 0,
              missing: !existsSync(join(this.pdfDir(), r.pdf_file)),
            }
          : null,
      leadCount: r.lead_count,
      createdAt: r.created_at,
    }))
  }

  /**
   * All products with their labels, for the matcher. Inactive products still match (so their
   * leads are not reported as unrecognized) but never contribute attachments.
   */
  matchable(): MatchableProduct[] {
    return this.all().map((p) => ({
      id: p.id,
      name: p.name,
      synonyms: p.synonyms.map((s) => s.value),
    }))
  }

  private assertLabelFree(label: string, exceptProductId?: number): string {
    const norm = normalizeKey(label)
    if (!norm) throw new AppError('validation', 'empty label')
    const byName = this.db
      .prepare('SELECT id FROM products WHERE name_norm = ?')
      .pluck()
      .get(norm) as number | undefined
    const bySyn = this.db
      .prepare('SELECT product_id FROM product_synonyms WHERE value_norm = ?')
      .pluck()
      .get(norm) as number | undefined
    const owner = byName ?? bySyn
    if (owner !== undefined && owner !== exceptProductId) throw new AppError('duplicate', label)
    return norm
  }

  create(name: string, active: boolean, synonyms: string[]): number {
    return this.db.transaction(() => {
      const norm = this.assertLabelFree(name)
      const id = Number(
        this.db
          .prepare('INSERT INTO products (name, name_norm, active) VALUES (?, ?, ?)')
          .run(name, norm, active ? 1 : 0).lastInsertRowid,
      )
      for (const s of synonyms) this.addSynonymInTx(id, s)
      return id
    })()
  }

  update(id: number, patch: { name?: string; active?: boolean; synonyms?: string[] }): void {
    this.db.transaction(() => {
      this.require(id)
      if (patch.name !== undefined) {
        const norm = this.assertLabelFree(patch.name, id)
        this.db
          .prepare('UPDATE products SET name = ?, name_norm = ?, updated_at = ? WHERE id = ?')
          .run(patch.name, norm, new Date().toISOString(), id)
      }
      if (patch.active !== undefined) {
        this.db
          .prepare('UPDATE products SET active = ?, updated_at = ? WHERE id = ?')
          .run(patch.active ? 1 : 0, new Date().toISOString(), id)
      }
      if (patch.synonyms !== undefined) {
        this.db.prepare('DELETE FROM product_synonyms WHERE product_id = ?').run(id)
        const ownNorm = this.db
          .prepare('SELECT name_norm FROM products WHERE id = ?')
          .pluck()
          .get(id) as string
        const seen = new Set([ownNorm])
        for (const s of patch.synonyms) {
          const norm = normalizeKey(s)
          if (!norm || seen.has(norm)) continue
          seen.add(norm)
          this.addSynonymInTx(id, s)
        }
      }
    })()
  }

  private addSynonymInTx(productId: number, value: string): void {
    const norm = this.assertLabelFree(value, productId)
    this.db
      .prepare(
        'INSERT OR IGNORE INTO product_synonyms (product_id, value, value_norm) VALUES (?, ?, ?)',
      )
      .run(productId, value.trim(), norm)
    // A value linked to a product is no longer "ignored".
    this.db.prepare('DELETE FROM ignored_product_values WHERE value_norm = ?').run(norm)
  }

  addSynonym(productId: number, value: string): void {
    this.db.transaction(() => {
      this.require(productId)
      this.addSynonymInTx(productId, value)
    })()
  }

  /** Returns the stored PDF file name, if any, so the caller can delete it. */
  delete(id: number): string | null {
    const file = this.db.prepare('SELECT pdf_file FROM products WHERE id = ?').pluck().get(id) as
      string | null | undefined
    if (file === undefined) throw new AppError('notFound', 'product')
    this.db.prepare('DELETE FROM products WHERE id = ?').run(id)
    return file
  }

  /** Sets the PDF and returns the previous file name (to delete). */
  setPdf(id: number, pdf: { file: string; name: string; size: number } | null): string | null {
    const previous = this.require(id).pdf_file
    this.db
      .prepare(
        'UPDATE products SET pdf_file = ?, pdf_name = ?, pdf_size = ?, updated_at = ? WHERE id = ?',
      )
      .run(pdf?.file ?? null, pdf?.name ?? null, pdf?.size ?? null, new Date().toISOString(), id)
    return previous
  }

  pdfPath(id: number): string | null {
    const file = this.require(id).pdf_file
    return file ? join(this.pdfDir(), file) : null
  }

  /** PDFs to attach for a lead: one per distinct active product with a PDF. */
  pdfsForLead(leadId: number): ProductPdf[] {
    return this.db
      .prepare(
        `SELECT DISTINCT p.id AS productId, p.name AS productName, p.pdf_file AS file, p.pdf_name AS name,
                p.pdf_size AS size
         FROM lead_product_values lpv JOIN products p ON p.id = lpv.product_id
         WHERE lpv.lead_id = ? AND p.active = 1 AND p.pdf_file IS NOT NULL
         ORDER BY lpv.id`,
      )
      .all(leadId) as ProductPdf[]
  }

  unmatchedValues(): Array<{ value: string; valueNorm: string; leadCount: number }> {
    return this.db
      .prepare(
        `SELECT MIN(lpv.value) AS value, lpv.value_norm AS valueNorm, COUNT(DISTINCT lpv.lead_id) AS leadCount
         FROM lead_product_values lpv JOIN leads l ON l.id = lpv.lead_id AND l.deleted_at IS NULL
         WHERE lpv.product_id IS NULL
           AND lpv.value_norm NOT IN (SELECT value_norm FROM ignored_product_values)
         GROUP BY lpv.value_norm ORDER BY leadCount DESC, value COLLATE NOCASE`,
      )
      .all() as Array<{ value: string; valueNorm: string; leadCount: number }>
  }

  ignoredValues(): IgnoredValue[] {
    return this.db
      .prepare(
        `SELECT i.value, i.value_norm AS valueNorm,
                (SELECT COUNT(DISTINCT lpv.lead_id) FROM lead_product_values lpv
                 JOIN leads l ON l.id = lpv.lead_id AND l.deleted_at IS NULL
                 WHERE lpv.value_norm = i.value_norm) AS leadCount
         FROM ignored_product_values i ORDER BY i.value COLLATE NOCASE`,
      )
      .all() as IgnoredValue[]
  }

  ignore(value: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO ignored_product_values (value_norm, value) VALUES (?, ?)')
      .run(normalizeKey(value), value.trim())
  }

  unignore(valueNorm: string): void {
    this.db.prepare('DELETE FROM ignored_product_values WHERE value_norm = ?').run(valueNorm)
  }

  private require(id: number): RawProduct {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      RawProduct | undefined
    if (!row) throw new AppError('notFound', 'product')
    return row
  }
}
