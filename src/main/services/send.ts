import { existsSync } from 'node:fs'
import { AppError } from '@shared/errors'
import { t } from '@shared/i18n'
import type { LeadSendChecks, SendOutcome } from '@shared/schemas/send'
import type { TemplateSource } from '@shared/schemas/template'
import type { DB } from '../db/connection'
import type { SendsRepo, NewSend } from '../repos/sends'
import type { MailService } from '../mailer/service'
import type { BuiltMessage, MessageBuilder } from './message'
import { logger } from '../logger'

/** Errors that mean "fix the account, then retry", not "this recipient failed". */
export const ACCOUNT_ERRORS = new Set([
  'authRequired',
  'authExpired',
  'authNotConfigured',
  'smtpNotConfigured',
  'smtpAuthFailed',
  'smtpConnection',
])

export function sendStamp(id: number, createdAt: string): string {
  return `lm-${id}-${Date.parse(createdAt) || 0}`
}

export function toNewSend(m: BuiltMessage): NewSend {
  return {
    leadId: m.leadId,
    templateId: m.templateId,
    templateName: m.templateName,
    toEmail: m.to,
    toName: m.toName,
    subject: m.subject,
    bodyHtml: m.html,
    attachments: m.files.map((f) => ({
      productId: f.productId,
      name: f.name,
      file: f.file,
      size: f.size,
    })),
  }
}

export class SendService {
  constructor(
    private readonly db: DB,
    private readonly sends: SendsRepo,
    private readonly messages: MessageBuilder,
    private readonly mail: MailService,
    private readonly pdfPath: (file: string) => string,
    private readonly onChange: () => void,
  ) {}

  checks(leadId: number, templateId: number): LeadSendChecks {
    const status = this.db.prepare('SELECT status FROM leads WHERE id = ?').pluck().get(leadId) as
      string | undefined
    return {
      previousSendAt: this.sends.previousSendAt(leadId, templateId),
      doNotContact: status === 'do_not_contact',
    }
  }

  private setLeadStatus(leadId: number | null, status: 'sent' | 'error'): void {
    if (leadId === null) return
    this.db
      .prepare(
        "UPDATE leads SET status = ?, updated_at = ? WHERE id = ? AND status != 'do_not_contact'",
      )
      .run(status, new Date().toISOString(), leadId)
  }

  /**
   * Delivers one queued row. Idempotent: the row is claimed atomically, so a row that is
   * already sending or sent is never sent twice. Account problems put the row back in the
   * queue so it can be resumed after reconnecting.
   */
  async deliver(id: number, signal?: AbortSignal): Promise<SendOutcome> {
    const provider = this.mail.provider()
    if (!this.sends.claim(id, provider.kind)) {
      const row = this.sends.get(id)
      return { sendId: id, status: row?.status ?? 'failed', errorCode: row?.errorCode ?? null }
    }
    const row = this.sends.get(id)!
    try {
      const attachments = row.attachments.map((a) => {
        const path = this.pdfPath(a.file)
        if (!existsSync(path)) throw new AppError('pdfMissing', a.name)
        return { name: a.name, path, size: a.size, contentType: 'application/pdf' }
      })
      await provider.send(
        {
          sendId: sendStamp(row.id, row.createdAt),
          to: { email: row.toEmail, name: row.toName },
          subject: row.subject,
          html: row.bodyHtml,
          attachments,
        },
        signal,
      )
      this.sends.markSent(id)
      this.setLeadStatus(row.leadId, 'sent')
      logger.info(`[send] #${id} sent via ${provider.kind}`)
      return { sendId: id, status: 'sent', errorCode: null }
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('unknown', String(error))
      if (ACCOUNT_ERRORS.has(appError.code) || signal?.aborted) {
        // Not this recipient's fault: keep it queued for a later retry.
        this.sends.setStatus(id, 'queued', appError.code)
        logger.warn(`[send] #${id} requeued: ${appError.code}`)
        return { sendId: id, status: 'queued', errorCode: appError.code }
      }
      this.sends.markFailed(id, appError.code, appError.detail ?? null)
      this.setLeadStatus(row.leadId, 'error')
      logger.warn(`[send] #${id} failed: ${appError.code} ${appError.detail ?? ''}`)
      return { sendId: id, status: 'failed', errorCode: appError.code }
    } finally {
      this.onChange()
    }
  }

  async sendSingle(leadId: number, templateId: number): Promise<SendOutcome> {
    await this.mail.requireAccount()
    const message = this.messages.build({ templateId }, leadId)
    if (!message.emailValid) throw new AppError('recipientRejected', 'invalid address')
    const jobId = this.sends.createJob('single', templateId, message.templateName)
    const id = this.sends.addSend(jobId, toNewSend(message))
    const outcome = await this.deliver(id)
    this.db
      .prepare("UPDATE send_jobs SET status = 'completed', updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), jobId)
    if (outcome.status === 'queued' && outcome.errorCode) {
      // The single send could not happen because of the account; surface it to the user.
      this.sends.setStatus(id, 'failed', outcome.errorCode)
      throw new AppError(outcome.errorCode as AppError['code'])
    }
    return outcome
  }

  /** Sends the message to the signed-in user's own address; not recorded in history. */
  async sendTest(source: TemplateSource, leadId: number | null): Promise<string> {
    await this.mail.requireAccount()
    const account = (await this.mail.provider().getAccount())!
    const message = this.messages.build(source, leadId)
    const attachments = message.files.map((f) => {
      if (!existsSync(f.path)) throw new AppError('pdfMissing', f.name)
      return { name: f.name, path: f.path, size: f.size, contentType: 'application/pdf' }
    })
    await this.mail.provider().send({
      sendId: `test-${Date.now()}`,
      to: { email: account.email, name: account.name },
      subject: `${t('send.testPrefix')} ${message.subject}`,
      html: message.html,
      attachments,
    })
    logger.info('[send] test email sent')
    return account.email
  }
}
