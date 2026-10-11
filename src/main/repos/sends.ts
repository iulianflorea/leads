import type { SendAttachment, SendRecord, SendStatus } from '@shared/schemas/send'
import { normalizeEmail } from '@shared/matching/normalize'
import type { DB } from '../db/connection'

interface Raw {
  id: number
  job_id: number
  lead_id: number | null
  template_id: number | null
  template_name: string
  to_email: string
  to_name: string
  subject: string
  body_html: string
  attachments: string
  status: SendStatus
  error_code: string | null
  error_detail: string | null
  attempts: number
  provider: string | null
  created_at: string
  sent_at: string | null
}

export interface StoredSend extends SendRecord {
  bodyHtml: string
}

export function toRecord(r: Raw): StoredSend {
  let attachments: SendAttachment[]
  try {
    attachments = JSON.parse(r.attachments) as SendAttachment[]
  } catch {
    attachments = []
  }
  return {
    id: r.id,
    jobId: r.job_id,
    leadId: r.lead_id,
    templateId: r.template_id,
    templateName: r.template_name,
    toEmail: r.to_email,
    toName: r.to_name,
    subject: r.subject,
    bodyHtml: r.body_html,
    attachments,
    status: r.status,
    errorCode: r.error_code,
    errorDetail: r.error_detail,
    attempts: r.attempts,
    provider: r.provider,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  }
}

export interface NewSend {
  leadId: number | null
  templateId: number | null
  templateName: string
  toEmail: string
  toName: string
  subject: string
  bodyHtml: string
  attachments: SendAttachment[]
  status?: SendStatus
  errorCode?: string | null
}

const now = (): string => new Date().toISOString()

export class SendsRepo {
  constructor(private readonly db: DB) {}

  createJob(kind: 'single' | 'bulk', templateId: number | null, templateName: string): number {
    return Number(
      this.db
        .prepare('INSERT INTO send_jobs (kind, template_id, template_name) VALUES (?, ?, ?)')
        .run(kind, templateId, templateName).lastInsertRowid,
    )
  }

  addSend(jobId: number, s: NewSend): number {
    return Number(
      this.db
        .prepare(
          `INSERT INTO sends (job_id, lead_id, template_id, template_name, to_email, to_email_norm, to_name,
                              subject, body_html, attachments, status, error_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          jobId,
          s.leadId,
          s.templateId,
          s.templateName,
          s.toEmail,
          normalizeEmail(s.toEmail),
          s.toName,
          s.subject,
          s.bodyHtml,
          JSON.stringify(s.attachments),
          s.status ?? 'queued',
          s.errorCode ?? null,
        ).lastInsertRowid,
    )
  }

  get(id: number): StoredSend | null {
    const row = this.db.prepare('SELECT * FROM sends WHERE id = ?').get(id) as Raw | undefined
    return row ? toRecord(row) : null
  }

  /** Atomically claims a queued row for sending; false if it is no longer queued. */
  claim(id: number, provider: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE sends SET status = 'sending', attempts = attempts + 1, provider = ?, updated_at = ?
           WHERE id = ? AND status = 'queued'`,
        )
        .run(provider, now(), id).changes === 1
    )
  }

  markSent(id: number): void {
    const ts = now()
    this.db
      .prepare(
        "UPDATE sends SET status = 'sent', error_code = NULL, error_detail = NULL, sent_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(ts, ts, id)
  }

  markFailed(id: number, code: string, detail: string | null): void {
    this.db
      .prepare(
        "UPDATE sends SET status = 'failed', error_code = ?, error_detail = ?, updated_at = ? WHERE id = ?",
      )
      .run(code, detail, now(), id)
  }

  setStatus(id: number, status: SendStatus, errorCode: string | null = null): void {
    this.db
      .prepare(
        'UPDATE sends SET status = ?, error_code = COALESCE(?, error_code), updated_at = ? WHERE id = ?',
      )
      .run(status, errorCode, now(), id)
  }

  /** Last time `leadId` (or the same address) received `templateId`. */
  previousSendAt(leadId: number, templateId: number): string | null {
    return (
      (this.db
        .prepare(
          `SELECT MAX(s.sent_at) FROM sends s
           WHERE s.status = 'sent' AND s.template_id = ?
             AND (s.lead_id = ? OR s.to_email_norm = (SELECT email_norm FROM leads WHERE id = ?))`,
        )
        .pluck()
        .get(templateId, leadId, leadId) as string | null) ?? null
    )
  }

  forLead(leadId: number): SendRecord[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM sends WHERE lead_id = ? OR to_email_norm = (SELECT email_norm FROM leads WHERE id = ?)
           ORDER BY created_at DESC LIMIT 200`,
        )
        .all(leadId, leadId) as Raw[]
    ).map((r) => {
      const { bodyHtml: _body, ...rest } = toRecord(r)
      return rest
    })
  }
}
