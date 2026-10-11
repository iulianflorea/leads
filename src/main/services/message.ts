import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { composeEmail } from '@shared/template/compose'
import type { TemplateLead } from '@shared/template/render'
import type { EmailPreview, TemplateSource } from '@shared/schemas/template'
import type { LeadDetail } from '@shared/schemas/lead'
import { isValidEmail } from '@shared/import/validate'
import { t } from '@shared/i18n'
import type { DB } from '../db/connection'
import type { LeadsRepo } from '../repos/leads'
import type { ProductsRepo, ProductPdf } from '../repos/products'
import type { TemplatesRepo } from '../repos/templates'
import type { SettingsService } from './settings'

export interface BuiltMessage extends EmailPreview {
  leadId: number | null
  templateId: number | null
  templateName: string
  /** Attachments with absolute paths, ready for a mail provider. */
  files: Array<ProductPdf & { path: string }>
}

function toTemplateLead(lead: LeadDetail): TemplateLead {
  const productNames = [
    ...new Set(lead.products.map((p) => p.productName).filter((n): n is string => !!n)),
  ]
  return {
    name: lead.name,
    firstName: lead.firstName,
    email: lead.email,
    phone: lead.phone,
    address: lead.address,
    product: productNames.length ? productNames.join(', ') : lead.productRaw,
    extra: lead.extra,
  }
}

/** Builds personalized messages (subject, HTML, attachments) from a template and a lead. */
export class MessageBuilder {
  constructor(
    private readonly db: DB,
    private readonly leads: LeadsRepo,
    private readonly products: ProductsRepo,
    private readonly templates: TemplatesRepo,
    private readonly settings: SettingsService,
    private readonly pdfDir: () => string,
  ) {}

  /** Every extra column name present on any lead (for unknown-variable detection). */
  knownExtras(): string[] {
    return this.db
      .prepare(
        `SELECT DISTINCT j.key FROM leads l, json_each(l.extra) j
         WHERE l.deleted_at IS NULL ORDER BY j.key COLLATE NOCASE`,
      )
      .pluck()
      .all() as string[]
  }

  private sampleLead(): TemplateLead {
    return {
      name: t('templates.sampleName'),
      firstName: t('templates.sampleFirstName'),
      email: 'client@exemplu.ro',
      phone: '0722 000 000',
      address: t('templates.sampleAddress'),
      product: t('templates.sampleProduct'),
      extra: Object.fromEntries(this.knownExtras().map((k) => [k, `[${k}]`])),
    }
  }

  build(source: TemplateSource, leadId: number | null, extras?: string[]): BuiltMessage {
    const template = 'templateId' in source ? this.templates.get(source.templateId) : null
    const content = template ?? ('draft' in source ? source.draft : { subject: '', bodyHtml: '' })
    const settings = this.settings.get()
    const lead = leadId === null ? null : this.leads.get(leadId)
    const data = lead ? toTemplateLead(lead) : this.sampleLead()

    const email = composeEmail(
      {
        subject: content.subject,
        bodyHtml: content.bodyHtml,
        signatureHtml: settings.signatureHtml,
        unsubscribeHtml: settings.unsubscribeEnabled ? settings.unsubscribeHtml : null,
        knownExtras: extras ?? this.knownExtras(),
      },
      data,
    )
    const pdfs = lead ? this.products.pdfsForLead(lead.id) : []
    const files = pdfs.map((p) => ({ ...p, path: join(this.pdfDir(), p.file) }))
    return {
      leadId: lead?.id ?? null,
      templateId: template?.id ?? null,
      templateName: template?.name ?? '',
      to: data.email,
      toName: data.name,
      subject: email.subject,
      html: email.html,
      missing: email.missing,
      unknown: email.unknown,
      attachments: files
        .filter((f) => existsSync(f.path))
        .map((f) => ({ productId: f.productId, name: f.name, size: f.size })),
      unresolvedProducts: lead
        ? lead.products.filter((p) => !p.hasPdf && !p.ignored).map((p) => p.value)
        : [],
      emailValid: isValidEmail(data.email),
      sample: !lead,
      files,
    }
  }

  /** Strips server-only fields for the renderer. */
  static toPreview(m: BuiltMessage): EmailPreview {
    return {
      to: m.to,
      toName: m.toName,
      subject: m.subject,
      html: m.html,
      missing: m.missing,
      unknown: m.unknown,
      attachments: m.attachments,
      unresolvedProducts: m.unresolvedProducts,
      emailValid: m.emailValid,
      sample: m.sample,
    }
  }
}
