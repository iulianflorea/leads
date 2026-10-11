import { z } from 'zod'
import { templateSourceSchema } from './template'

export const sendStatuses = [
  'queued',
  'sending',
  'sent',
  'failed',
  'skipped',
  'cancelled',
  'unknown',
] as const
export type SendStatus = (typeof sendStatuses)[number]

export interface SendAttachment {
  productId: number
  name: string
  file: string
  size: number
}

export interface SendRecord {
  id: number
  jobId: number
  leadId: number | null
  templateId: number | null
  templateName: string
  toEmail: string
  toName: string
  subject: string
  attachments: SendAttachment[]
  status: SendStatus
  errorCode: string | null
  errorDetail: string | null
  attempts: number
  provider: string | null
  createdAt: string
  sentAt: string | null
}

export interface LeadSendChecks {
  /** When this lead last received this template, if ever. */
  previousSendAt: string | null
  doNotContact: boolean
}

export const sendSingleSchema = z.object({
  leadId: z.number().int(),
  templateId: z.number().int(),
})

export const sendTestSchema = z.object({
  source: templateSourceSchema,
  leadId: z.number().int().nullable(),
})

export interface SendOutcome {
  sendId: number
  status: SendStatus
  errorCode: string | null
}

export type JobStatus = 'running' | 'paused' | 'cancelled' | 'completed'

export interface JobProgress {
  jobId: number
  templateName: string
  status: JobStatus
  total: number
  sent: number
  failed: number
  skipped: number
  queued: number
  unknown: number
  /** Why the job paused itself (e.g. authExpired), if it did. */
  pausedReason: string | null
  createdAt: string
  /** When the next email is due, for the countdown. */
  nextAt: string | null
}

export const bulkTargetSchema = z.union([
  z.object({ leadIds: z.array(z.number().int()).min(1).max(100_000) }),
  z.object({ listId: z.number().int() }),
])

export const bulkPrepareSchema = z.object({
  target: bulkTargetSchema,
  templateId: z.number().int(),
})

export const bulkStartSchema = bulkPrepareSchema.extend({
  skipAlreadySent: z.boolean().default(true),
  includeWithoutPdf: z.boolean().default(true),
})
export type BulkStartInput = z.input<typeof bulkStartSchema>

export interface BulkSummary {
  selected: number
  /** Will receive the email with the current options. */
  ready: number
  invalidEmail: number
  doNotContact: number
  duplicates: number
  alreadySent: number
  withoutPdf: number
  estimatedSeconds: number
}

export const jobIdSchema = z.object({ jobId: z.number().int() })

export const historyQuerySchema = z.object({
  search: z.string().max(200).default(''),
  status: z.enum(sendStatuses).nullable().default(null),
  templateId: z.number().int().nullable().default(null),
  jobId: z.number().int().nullable().default(null),
})
export type HistoryQuery = z.input<typeof historyQuerySchema>
