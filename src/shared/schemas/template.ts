import { z } from 'zod'

export interface Template {
  id: number
  name: string
  subject: string
  bodyHtml: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

const fields = {
  name: z.string().trim().min(1).max(200),
  subject: z.string().max(998),
  bodyHtml: z.string().max(500_000),
}

export const templateInputSchema = z.object({
  name: fields.name,
  subject: fields.subject.default(''),
  bodyHtml: fields.bodyHtml.default(''),
})
export const templatePatchSchema = z.object(fields).partial()

/** Content to preview or send: a saved template or an unsaved draft. */
export const templateSourceSchema = z.union([
  z.object({ templateId: z.number().int() }),
  z.object({ draft: z.object({ subject: fields.subject, bodyHtml: fields.bodyHtml }) }),
])
export type TemplateSource = z.input<typeof templateSourceSchema>

export const previewInputSchema = z.object({
  source: templateSourceSchema,
  /** null previews with sample data. */
  leadId: z.number().int().nullable(),
})

export interface PreviewAttachment {
  productId: number
  name: string
  size: number
}

export interface EmailPreview {
  to: string
  toName: string
  subject: string
  html: string
  missing: string[]
  unknown: string[]
  attachments: PreviewAttachment[]
  /** Product values on the lead without an attachment (unmatched or no PDF). */
  unresolvedProducts: string[]
  emailValid: boolean
  sample: boolean
}
