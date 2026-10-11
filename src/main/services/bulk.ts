import { AppError } from '@shared/errors'
import { isValidEmail } from '@shared/import/validate'
import type { BulkStartInput, BulkSummary } from '@shared/schemas/send'
import type { DB } from '../db/connection'
import type { SendsRepo } from '../repos/sends'
import type { MessageBuilder } from './message'
import type { SettingsService } from './settings'
import { toNewSend } from './send'

interface TargetLead {
  id: number
  name: string
  email: string
  email_norm: string
  status: string
  unresolved: number
  with_pdf: number
  already: number
}

type Category =
  'ready' | 'invalidEmail' | 'doNotContact' | 'duplicate' | 'alreadySent' | 'withoutPdf'

/** Reason codes stored on skipped rows (shown in history as "skipped: ..."). */
export const SKIP_CODES: Record<Exclude<Category, 'ready' | 'withoutPdf'>, string> = {
  invalidEmail: 'skipInvalidEmail',
  doNotContact: 'skipDoNotContact',
  duplicate: 'skipDuplicate',
  alreadySent: 'skipAlreadySent',
}

/** Prepares bulk sends: who gets the email, who is skipped and why. */
export class BulkService {
  constructor(
    private readonly db: DB,
    private readonly sends: SendsRepo,
    private readonly messages: MessageBuilder,
    private readonly settings: SettingsService,
  ) {}

  private leads(target: BulkStartInput['target'], templateId: number): TargetLead[] {
    const select = `
      SELECT l.id, l.name, l.email, l.email_norm, l.status,
        (SELECT COUNT(*) FROM lead_product_values x
           LEFT JOIN products p ON p.id = x.product_id
           LEFT JOIN ignored_product_values i ON i.value_norm = x.value_norm
          WHERE x.lead_id = l.id AND (p.id IS NULL OR p.active = 0 OR p.pdf_file IS NULL)
            AND i.value_norm IS NULL) AS unresolved,
        (SELECT COUNT(*) FROM lead_product_values x JOIN products p ON p.id = x.product_id
          WHERE x.lead_id = l.id AND p.active = 1 AND p.pdf_file IS NOT NULL) AS with_pdf,
        (SELECT COUNT(*) FROM sends s WHERE s.status = 'sent' AND s.template_id = @templateId
          AND (s.lead_id = l.id OR (l.email_norm != '' AND s.to_email_norm = l.email_norm))) AS already
      FROM leads l WHERE l.deleted_at IS NULL`
    if ('listId' in target) {
      return this.db
        .prepare(`${select} AND l.list_id = @listId ORDER BY l.id`)
        .all({ listId: target.listId, templateId }) as TargetLead[]
    }
    const stmt = this.db.prepare(`${select} AND l.id = @id`)
    // Keep the user's order (e.g. the sorted table selection).
    return target.leadIds
      .map((id) => stmt.get({ id, templateId }) as TargetLead | undefined)
      .filter((x): x is TargetLead => !!x)
  }

  private categorize(
    rows: TargetLead[],
    skipAlreadySent: boolean,
    dnc: ReadonlySet<string>,
  ): Category[] {
    const seen = new Set<string>()
    return rows.map((r) => {
      if (!isValidEmail(r.email)) return 'invalidEmail'
      if (r.status === 'do_not_contact' || dnc.has(r.email_norm)) return 'doNotContact'
      if (seen.has(r.email_norm)) return 'duplicate'
      seen.add(r.email_norm)
      if (skipAlreadySent && r.already > 0) return 'alreadySent'
      if (r.unresolved > 0 && r.with_pdf === 0) return 'withoutPdf'
      return 'ready'
    })
  }

  private dnc(): Set<string> {
    return new Set(
      this.db.prepare('SELECT email_norm FROM do_not_contact').pluck().all() as string[],
    )
  }

  prepare(target: BulkStartInput['target'], templateId: number): BulkSummary {
    const rows = this.leads(target, templateId)
    // The summary reports "already sent" even though skipping it is the default.
    const categories = this.categorize(rows, true, this.dnc())
    const count = (c: Category): number => categories.filter((x) => x === c).length
    const ready = count('ready') + count('withoutPdf')
    return {
      selected: rows.length,
      ready,
      invalidEmail: count('invalidEmail'),
      doNotContact: count('doNotContact'),
      duplicates: count('duplicate'),
      alreadySent: count('alreadySent'),
      withoutPdf: count('withoutPdf'),
      estimatedSeconds: Math.max(0, ready - 1) * this.settings.get().sendIntervalSeconds,
    }
  }

  /** Creates a job and snapshots every message; returns the job id. */
  create(input: Required<BulkStartInput>): number {
    const rows = this.leads(input.target, input.templateId)
    const categories = this.categorize(rows, input.skipAlreadySent, this.dnc())
    const extras = this.messages.knownExtras()
    return this.db.transaction(() => {
      const first = this.messages.build({ templateId: input.templateId }, null, extras)
      const jobId = this.sends.createJob('bulk', input.templateId, first.templateName)
      let queued = 0
      rows.forEach((lead, i) => {
        const category = categories[i]!
        const skip =
          category === 'withoutPdf'
            ? input.includeWithoutPdf
              ? null
              : 'skipNoPdf'
            : category === 'ready'
              ? null
              : SKIP_CODES[category]
        if (skip) {
          this.sends.addSend(jobId, {
            leadId: lead.id,
            templateId: input.templateId,
            templateName: first.templateName,
            toEmail: lead.email,
            toName: lead.name,
            subject: '',
            bodyHtml: '',
            attachments: [],
            status: 'skipped',
            errorCode: skip,
          })
          return
        }
        const message = this.messages.build({ templateId: input.templateId }, lead.id, extras)
        this.sends.addSend(jobId, toNewSend(message))
        queued++
      })
      if (queued === 0) throw new AppError('validation', 'nothing to send')
      return jobId
    })()
  }
}
