import { z } from 'zod'

export const leadStatuses = ['new', 'sent', 'error', 'do_not_contact'] as const
export const leadStatusSchema = z.enum(leadStatuses)
export type LeadStatus = z.infer<typeof leadStatusSchema>

/** Whether the lead's products resolve to attachments. */
export type PdfState = 'ok' | 'partial' | 'missing' | 'none'

export interface LeadRow {
  id: number
  listId: number | null
  listName: string | null
  name: string
  firstName: string
  email: string
  phone: string
  address: string
  productRaw: string
  status: LeadStatus
  emailValid: boolean
  /** ok = every value has a PDF (or is explicitly sent without); partial/missing = some/all unresolved. */
  pdfState: PdfState
  attachmentCount: number
  sentCount: number
  lastSentAt: string | null
  createdAt: string
}

export interface LeadProductValue {
  value: string
  productId: number | null
  productName: string | null
  hasPdf: boolean
  ignored: boolean
}

export interface LeadDetail extends LeadRow {
  extra: Record<string, string>
  products: LeadProductValue[]
  updatedAt: string
}

export const leadSortSchema = z.enum([
  'name',
  'email',
  'status',
  'product',
  'list',
  'createdAt',
  'lastSentAt',
])
export type LeadSort = z.infer<typeof leadSortSchema>

export const leadQuerySchema = z.object({
  search: z.string().max(200).default(''),
  listId: z.number().int().nullable().default(null),
  productId: z.number().int().nullable().default(null),
  status: leadStatusSchema.nullable().default(null),
  hasPdf: z.boolean().nullable().default(null),
  sort: leadSortSchema.default('createdAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
})
export type LeadQuery = z.input<typeof leadQuerySchema>

const text = (max: number) => z.string().trim().max(max)

const leadFields = {
  listId: z.number().int().nullable(),
  name: text(300),
  firstName: text(150),
  email: text(320),
  phone: text(60),
  address: text(500),
  productRaw: text(1000),
  extra: z.record(z.string().max(200), z.string().max(5000)),
}

export const leadInputSchema = z.object({
  listId: leadFields.listId.optional(),
  name: leadFields.name.default(''),
  firstName: leadFields.firstName.default(''),
  email: leadFields.email.default(''),
  phone: leadFields.phone.default(''),
  address: leadFields.address.default(''),
  productRaw: leadFields.productRaw.default(''),
  extra: leadFields.extra.default({}),
})
export type LeadInput = z.input<typeof leadInputSchema>

/** Only the provided fields change; no defaults here, so omitted fields stay untouched. */
export const leadPatchSchema = z.object({ ...leadFields, status: leadStatusSchema }).partial()
export type LeadPatch = z.input<typeof leadPatchSchema>

export interface ListSummary {
  id: number
  name: string
  leadCount: number
  createdAt: string
}

export const idsSchema = z.object({ ids: z.array(z.number().int()).min(1).max(100_000) })
export const idSchema = z.object({ id: z.number().int() })
