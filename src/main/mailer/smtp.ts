import nodemailer, { type Transporter } from 'nodemailer'
import { AppError } from '@shared/errors'
import type { MailAccount } from '@shared/schemas/mail'
import type { SmtpSettings } from '@shared/schemas/settings'
import { withRetry } from './retry'
import type { MailProvider, OutgoingMessage, SendResult } from './types'

interface SmtpError {
  code?: string
  responseCode?: number
}

export function mapSmtpError(error: unknown): AppError {
  if (error instanceof AppError) return error
  const e = (error ?? {}) as SmtpError
  const detail = [e.code, e.responseCode].filter(Boolean).join(' ')
  if (e.code === 'EAUTH') return new AppError('smtpAuthFailed', detail)
  if (e.code === 'ETIMEDOUT' || e.code === 'ESOCKET') return new AppError('network', detail)
  if (
    e.code === 'ECONNECTION' ||
    e.code === 'EDNS' ||
    e.code === 'ECONNREFUSED' ||
    e.code === 'ETLS'
  ) {
    return new AppError('smtpConnection', detail)
  }
  if (
    e.responseCode === 421 ||
    e.responseCode === 450 ||
    e.responseCode === 451 ||
    e.responseCode === 452
  ) {
    return new AppError('throttled', detail)
  }
  if (e.responseCode === 552) return new AppError('attachmentTooLarge', detail)
  if (e.code === 'EENVELOPE' || e.responseCode === 550 || e.responseCode === 553) {
    return new AppError('recipientRejected', detail)
  }
  return new AppError('unknown', detail || 'smtp')
}

function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h\d|\/li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * SMTP sending (e.g. a company mail server, or Gmail with an app password). Note: unlike
 * Graph, SMTP does not put a copy in the Sent folder.
 */
export class SmtpMailProvider implements MailProvider {
  readonly kind = 'smtp' as const
  private transporter: Transporter | null = null

  constructor(
    private readonly config: () => SmtpSettings,
    private readonly password: () => string | null,
  ) {}

  get configured(): boolean {
    const c = this.config()
    return !!(c.host && c.fromEmail && (c.user ? this.password() : true))
  }

  private transport(): Transporter {
    if (!this.configured) throw new AppError('smtpNotConfigured')
    if (this.transporter) return this.transporter
    const c = this.config()
    const pass = this.password()
    this.transporter = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: pass ?? '' } : undefined,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 60_000,
    })
    return this.transporter
  }

  /** Drop the cached connection after settings change. */
  reset(): void {
    this.transporter?.close()
    this.transporter = null
  }

  async getAccount(): Promise<MailAccount | null> {
    if (!this.configured) return null
    const c = this.config()
    return { provider: 'smtp', email: c.fromEmail, name: c.fromName || c.fromEmail }
  }

  async verify(): Promise<void> {
    try {
      await this.transport().verify()
    } catch (error) {
      throw mapSmtpError(error)
    }
  }

  async send(m: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const c = this.config()
    return withRetry(
      async () => {
        try {
          const info = (await this.transport().sendMail({
            from: { name: c.fromName || c.fromEmail, address: c.fromEmail },
            to: { name: m.to.name || m.to.email, address: m.to.email },
            subject: m.subject,
            html: m.html,
            text: htmlToText(m.html),
            attachments: m.attachments.map((a) => ({
              filename: a.name,
              path: a.path,
              contentType: a.contentType,
            })),
            headers: { 'X-LeadMailer-Send-Id': m.sendId },
          })) as { messageId?: string }
          return { messageId: info.messageId }
        } catch (error) {
          throw mapSmtpError(error)
        }
      },
      {},
      signal,
    )
  }
}
