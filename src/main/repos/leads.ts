import {
  leadQuerySchema,
  type LeadDetail,
  type LeadInput,
  type LeadPatch,
  type LeadProductValue,
  type LeadQuery,
  type LeadRow,
  type LeadStatus,
  type PdfState,
} from '@shared/schemas/lead'
import { AppError } from '@shared/errors'
import { foldText, normalizeEmail, normalizeKey } from '@shared/matching/normalize'
import { deriveFirstName, isValidEmail, splitProducts } from '@shared/import/validate'
import type { DB } from '../db/connection'

/** Resolves a product value from a lead to a product id (see products service). */
export interface ProductResolver {
  resolve(value: string): number | null
}

export const nullResolver: ProductResolver = { resolve: () => null }

interface RawLeadRow {
  id: number
  list_id: number | null
  list_name: string | null
  name: string
  first_name: string
  email: string
  phone: string
  address: string
  product_raw: string
  status: LeadStatus
  extra: string
  created_at: string
  updated_at: string
  pv_total: number
  pv_with_pdf: number
  pv_unresolved: number
  sent_count: number
  last_sent_at: string | null
}

export interface NewLead {
  listId: number | null
  name: string
  firstName: string
  email: string
  phone: string
  address: string
  productRaw: string
  extra: Record<string, string>
}

const SELECT = `
WITH pv AS (
  SELECT lpv.lead_id,
         COUNT(*) AS total,
         SUM(CASE WHEN p.active = 1 AND p.pdf_file IS NOT NULL THEN 1 ELSE 0 END) AS with_pdf,
         SUM(CASE WHEN (p.id IS NULL OR p.active = 0 OR p.pdf_file IS NULL) AND ipv.value_norm IS NULL
                  THEN 1 ELSE 0 END) AS unresolved
  FROM lead_product_values lpv
  LEFT JOIN products p ON p.id = lpv.product_id
  LEFT JOIN ignored_product_values ipv ON ipv.value_norm = lpv.value_norm
  GROUP BY lpv.lead_id
),
sv AS (
  SELECT lead_id, COUNT(*) AS sent_count, MAX(sent_at) AS last_sent_at
  FROM sends WHERE status = 'sent' AND lead_id IS NOT NULL GROUP BY lead_id
)
SELECT l.id, l.list_id, li.name AS list_name, l.name, l.first_name, l.email, l.phone, l.address,
       l.product_raw, l.status, l.extra, l.created_at, l.updated_at,
       COALESCE(pv.total, 0) AS pv_total, COALESCE(pv.with_pdf, 0) AS pv_with_pdf,
       COALESCE(pv.unresolved, 0) AS pv_unresolved,
       COALESCE(sv.sent_count, 0) AS sent_count, sv.last_sent_at
FROM leads l
LEFT JOIN lists li ON li.id = l.list_id
LEFT JOIN pv ON pv.lead_id = l.id
LEFT JOIN sv ON sv.lead_id = l.id
`

const SORT_SQL: Record<string, string> = {
  name: 'l.name COLLATE NOCASE',
  email: 'l.email COLLATE NOCASE',
  status: 'l.status',
  product: 'l.product_raw COLLATE NOCASE',
  list: 'li.name COLLATE NOCASE',
  createdAt: 'l.created_at',
  lastSentAt: 'sv.last_sent_at',
}

function pdfState(r: RawLeadRow): PdfState {
  if (r.pv_total === 0) return 'none'
  if (r.pv_unresolved === 0) return 'ok'
  return r.pv_with_pdf > 0 ? 'partial' : 'missing'
}

function toRow(r: RawLeadRow): LeadRow {
  return {
    id: r.id,
    listId: r.list_id,
    listName: r.list_name,
    name: r.name,
    firstName: r.first_name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    productRaw: r.product_raw,
    status: r.status,
    emailValid: isValidEmail(r.email),
    pdfState: pdfState(r),
    attachmentCount: r.pv_with_pdf,
    sentCount: r.sent_count,
    lastSentAt: r.last_sent_at,
    createdAt: r.created_at,
  }
}

function parseExtra(json: string): Record<string, string> {
  try {
    const v = JSON.parse(json) as unknown
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export class LeadsRepo {
  private resolver: ProductResolver = nullResolver

  constructor(private readonly db: DB) {
    db.function('fold', { deterministic: true }, (value: unknown) =>
      typeof value === 'string' ? foldText(value) : '',
    )
  }

  setResolver(resolver: ProductResolver): void {
    this.resolver = resolver
  }

  query(input: LeadQuery): LeadRow[] {
    const q = leadQuerySchema.parse(input)
    const where = ['l.deleted_at IS NULL']
    const params: unknown[] = []
    if (q.search.trim()) {
      where.push(
        "fold(l.name || ' ' || l.email || ' ' || l.phone || ' ' || l.address || ' ' || l.product_raw || ' ' || l.extra) LIKE ?",
      )
      params.push(`%${foldText(q.search).replace(/[%_]/g, '')}%`)
    }
    if (q.listId !== null) {
      where.push('l.list_id = ?')
      params.push(q.listId)
    }
    if (q.status !== null) {
      where.push('l.status = ?')
      params.push(q.status)
    }
    if (q.productId !== null) {
      if (q.productId === 0) {
        // Leads with at least one value that matches no product.
        where.push(
          `EXISTS (SELECT 1 FROM lead_product_values x WHERE x.lead_id = l.id AND x.product_id IS NULL
                   AND x.value_norm NOT IN (SELECT value_norm FROM ignored_product_values))`,
        )
      } else {
        where.push(
          'EXISTS (SELECT 1 FROM lead_product_values x WHERE x.lead_id = l.id AND x.product_id = ?)',
        )
        params.push(q.productId)
      }
    }
    if (q.hasPdf !== null)
      where.push(q.hasPdf ? 'COALESCE(pv.with_pdf, 0) > 0' : 'COALESCE(pv.with_pdf, 0) = 0')

    const order = `${SORT_SQL[q.sort] ?? SORT_SQL.createdAt} ${q.direction === 'asc' ? 'ASC' : 'DESC'}, l.id DESC`
    const sql = `${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 200000`
    return (this.db.prepare(sql).all(...params) as RawLeadRow[]).map(toRow)
  }

  get(id: number): LeadDetail {
    const raw = this.db.prepare(`${SELECT} WHERE l.id = ? AND l.deleted_at IS NULL`).get(id) as
      RawLeadRow | undefined
    if (!raw) throw new AppError('notFound', 'lead')
    const products = this.db
      .prepare(
        `SELECT lpv.value, lpv.product_id AS productId, p.name AS productName,
                CASE WHEN p.active = 1 AND p.pdf_file IS NOT NULL THEN 1 ELSE 0 END AS hasPdf,
                CASE WHEN ipv.value_norm IS NULL THEN 0 ELSE 1 END AS ignored
         FROM lead_product_values lpv
         LEFT JOIN products p ON p.id = lpv.product_id
         LEFT JOIN ignored_product_values ipv ON ipv.value_norm = lpv.value_norm
         WHERE lpv.lead_id = ? ORDER BY lpv.id`,
      )
      .all(id) as Array<
      Omit<LeadProductValue, 'hasPdf' | 'ignored'> & { hasPdf: number; ignored: number }
    >
    return {
      ...toRow(raw),
      extra: parseExtra(raw.extra),
      updatedAt: raw.updated_at,
      products: products.map((p) => ({ ...p, hasPdf: !!p.hasPdf, ignored: !!p.ignored })),
    }
  }

  /** Normalized emails of all non-deleted leads. */
  existingEmails(): Set<string> {
    const rows = this.db
      .prepare(
        "SELECT DISTINCT email_norm FROM leads WHERE deleted_at IS NULL AND email_norm != ''",
      )
      .pluck()
      .all() as string[]
    return new Set(rows)
  }

  doNotContactEmails(): Set<string> {
    return new Set(
      this.db.prepare('SELECT email_norm FROM do_not_contact').pluck().all() as string[],
    )
  }

  private writeProductValues(leadId: number, productRaw: string): void {
    this.db.prepare('DELETE FROM lead_product_values WHERE lead_id = ?').run(leadId)
    const insert = this.db.prepare(
      'INSERT INTO lead_product_values (lead_id, value, value_norm, product_id) VALUES (?, ?, ?, ?)',
    )
    for (const value of splitProducts(productRaw)) {
      insert.run(leadId, value, normalizeKey(value), this.resolver.resolve(value))
    }
  }

  /** Inserts a lead; must run inside a transaction for bulk use. */
  insert(lead: NewLead, dnc: ReadonlySet<string>): number {
    const emailNorm = normalizeEmail(lead.email)
    const status: LeadStatus = emailNorm && dnc.has(emailNorm) ? 'do_not_contact' : 'new'
    const id = Number(
      this.db
        .prepare(
          `INSERT INTO leads (list_id, name, first_name, email, email_norm, phone, address, product_raw, extra, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          lead.listId,
          lead.name,
          lead.firstName,
          lead.email,
          emailNorm,
          lead.phone,
          lead.address,
          lead.productRaw,
          JSON.stringify(lead.extra),
          status,
        ).lastInsertRowid,
    )
    this.writeProductValues(id, lead.productRaw)
    return id
  }

  /** Updates leads sharing this email with non-empty incoming values. Returns affected ids. */
  updateByEmail(emailNorm: string, lead: NewLead): number[] {
    const ids = this.db
      .prepare('SELECT id, extra FROM leads WHERE email_norm = ? AND deleted_at IS NULL')
      .all(emailNorm) as Array<{ id: number; extra: string }>
    const stmt = this.db.prepare(
      `UPDATE leads SET
         list_id = COALESCE(?, list_id),
         name = CASE WHEN ? != '' THEN ? ELSE name END,
         first_name = CASE WHEN ? != '' THEN ? ELSE first_name END,
         phone = CASE WHEN ? != '' THEN ? ELSE phone END,
         address = CASE WHEN ? != '' THEN ? ELSE address END,
         product_raw = CASE WHEN ? != '' THEN ? ELSE product_raw END,
         extra = ?, updated_at = ?
       WHERE id = ?`,
    )
    const ts = new Date().toISOString()
    for (const { id, extra } of ids) {
      stmt.run(
        lead.listId,
        lead.name,
        lead.name,
        lead.firstName,
        lead.firstName,
        lead.phone,
        lead.phone,
        lead.address,
        lead.address,
        lead.productRaw,
        lead.productRaw,
        JSON.stringify({ ...parseExtra(extra), ...lead.extra }),
        ts,
        id,
      )
      if (lead.productRaw) this.writeProductValues(id, lead.productRaw)
    }
    return ids.map((r) => r.id)
  }

  create(input: Required<Omit<LeadInput, 'listId'>> & { listId?: number | null }): number {
    return this.db.transaction(() =>
      this.insert(
        {
          listId: input.listId ?? null,
          name: input.name,
          firstName: input.firstName || deriveFirstName(input.name),
          email: input.email,
          phone: input.phone,
          address: input.address,
          productRaw: input.productRaw,
          extra: input.extra,
        },
        this.doNotContactEmails(),
      ),
    )()
  }

  update(id: number, patch: LeadPatch): void {
    this.db.transaction(() => {
      const current = this.db
        .prepare('SELECT * FROM leads WHERE id = ? AND deleted_at IS NULL')
        .get(id) as Record<string, unknown> | undefined
      if (!current) throw new AppError('notFound', 'lead')
      const sets: string[] = []
      const params: unknown[] = []
      const set = (col: string, value: unknown): void => {
        sets.push(`${col} = ?`)
        params.push(value)
      }
      if (patch.listId !== undefined) set('list_id', patch.listId)
      if (patch.name !== undefined) set('name', patch.name)
      if (patch.firstName !== undefined) set('first_name', patch.firstName)
      if (patch.email !== undefined) {
        set('email', patch.email)
        set('email_norm', normalizeEmail(patch.email))
      }
      if (patch.phone !== undefined) set('phone', patch.phone)
      if (patch.address !== undefined) set('address', patch.address)
      if (patch.productRaw !== undefined) set('product_raw', patch.productRaw)
      if (patch.extra !== undefined) set('extra', JSON.stringify(patch.extra))
      if (sets.length) {
        set('updated_at', new Date().toISOString())
        this.db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).run(...params, id)
      }
      if (patch.productRaw !== undefined) this.writeProductValues(id, patch.productRaw)
      if (patch.status !== undefined) this.setStatus([id], patch.status)
    })()
  }

  /** Changes status; "do not contact" is mirrored in the do_not_contact table by email. */
  setStatus(ids: number[], status: LeadStatus): void {
    this.db.transaction(() => {
      const ts = new Date().toISOString()
      const update = this.db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?')
      const emailOf = this.db.prepare('SELECT email_norm FROM leads WHERE id = ?').pluck()
      for (const id of ids) {
        update.run(status, ts, id)
        const email = emailOf.get(id) as string | undefined
        if (!email) continue
        if (status === 'do_not_contact') {
          this.db.prepare('INSERT OR IGNORE INTO do_not_contact (email_norm) VALUES (?)').run(email)
        } else {
          this.db.prepare('DELETE FROM do_not_contact WHERE email_norm = ?').run(email)
          // Other leads with the same email are no longer blocked either.
          this.db
            .prepare(
              "UPDATE leads SET status = 'new', updated_at = ? WHERE email_norm = ? AND status = 'do_not_contact'",
            )
            .run(ts, email)
        }
      }
      if (status === 'do_not_contact') {
        this.db
          .prepare(
            `UPDATE leads SET status = 'do_not_contact', updated_at = ?
             WHERE deleted_at IS NULL AND email_norm IN (SELECT email_norm FROM do_not_contact)`,
          )
          .run(ts)
      }
    })()
  }

  softDelete(ids: number[]): void {
    const stmt = this.db.prepare('UPDATE leads SET deleted_at = ? WHERE id = ?')
    const ts = new Date().toISOString()
    this.db.transaction(() => ids.forEach((id) => stmt.run(ts, id)))()
  }

  restore(ids: number[]): void {
    const stmt = this.db.prepare('UPDATE leads SET deleted_at = NULL WHERE id = ?')
    this.db.transaction(() => ids.forEach((id) => stmt.run(id)))()
  }

  /** Permanently removes leads soft-deleted more than `days` ago. */
  purgeDeleted(days = 30): void {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
    this.db.prepare('DELETE FROM leads WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff)
  }

  /** Re-resolves every product value (after products or synonyms change). */
  rematchAll(): void {
    const rows = this.db.prepare('SELECT id, value FROM lead_product_values').all() as Array<{
      id: number
      value: string
    }>
    const update = this.db.prepare('UPDATE lead_product_values SET product_id = ? WHERE id = ?')
    this.db.transaction(() => {
      for (const r of rows) update.run(this.resolver.resolve(r.value), r.id)
    })()
  }

  /** Number of non-deleted leads. */
  counts(): { total: number } {
    return this.db
      .prepare('SELECT COUNT(*) AS total FROM leads WHERE deleted_at IS NULL')
      .get() as {
      total: number
    }
  }
}
