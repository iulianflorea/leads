import type { MailAccount } from '@shared/schemas/mail'
import type { MailProviderKind } from '@shared/schemas/settings'

export interface OutgoingAttachment {
  name: string
  path: string
  size: number
  contentType: string
}

export interface OutgoingMessage {
  /** Local send id, stamped on the message so a send can be verified after a crash. */
  sendId: string
  to: { email: string; name: string }
  subject: string
  html: string
  attachments: OutgoingAttachment[]
}

export interface SendResult {
  messageId?: string
}

/**
 * A way to send email. Implementations throw AppError with codes such as
 * authRequired / authExpired / throttled / network / recipientRejected.
 */
export interface MailProvider {
  readonly kind: MailProviderKind
  getAccount(): Promise<MailAccount | null>
  send(message: OutgoingMessage, signal?: AbortSignal): Promise<SendResult>
  /**
   * Whether a message stamped with `sendId` was already sent (true/false),
   * or null when the provider cannot tell.
   */
  wasSent?(sendId: string): Promise<boolean | null>
}
