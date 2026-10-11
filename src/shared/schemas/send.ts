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
