import { openSync, readSync, closeSync, readFileSync } from 'node:fs'
import { GRAPH_BASE_URL, GRAPH_INLINE_ATTACHMENT_LIMIT } from '@shared/config'
import { AppError } from '@shared/errors'
import type { MailAccount } from '@shared/schemas/mail'
import type { MicrosoftAuth } from '../auth/microsoft'
import { logger } from '../logger'
import { parseRetryAfter, withRetry } from './retry'
import type { MailProvider, OutgoingAttachment, OutgoingMessage, SendResult } from './types'

/** MAPI named property that stamps our local send id on each message (used to verify sends). */
const SEND_ID_PROPERTY = 'String {6f1c9a52-8d3e-4b7a-a1f0-2c5e9b7d4a13} Name LeadMailerSendId'
/** Upload session chunks must be multiples of 320 KiB. */
const UPLOAD_CHUNK = 320 * 1024 * 10

interface GraphErrorBody {
  error?: { code?: string; message?: string }
}

async function toAppError(res: Response): Promise<AppError> {
  let code = ''
  let message = ''
  try {
    const body = (await res.json()) as GraphErrorBody
    code = body.error?.code ?? ''
    message = body.error?.message ?? ''
  } catch {
    // Non-JSON body.
  }
  const detail = `${res.status} ${code}`.trim()
  const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'))
  if (res.status === 429 || res.status === 503 || res.status === 504) {
    return new AppError('throttled', detail, { retryAfterMs })
  }
  if (res.status === 401) return new AppError('authExpired', detail)
  if (res.status === 413 || /size|too large/i.test(code))
    return new AppError('attachmentTooLarge', detail)
  if (
    /MailboxNotEnabled|MailboxNotSupported|MailboxInfoStale|ErrorMailboxStoreUnavailable/i.test(
      code,
    )
  ) {
    return new AppError('mailboxUnavailable', detail, { retryAfterMs })
  }
  if (res.status === 403) return new AppError('authExpired', detail)
  if (/InvalidRecipients|ErrorInvalidRecipients/i.test(code) || /recipient/i.test(message)) {
    return new AppError('recipientRejected', detail)
  }
  if (res.status >= 500) return new AppError('network', detail, { retryAfterMs })
  return new AppError('unknown', detail)
}

function fileAttachment(a: OutgoingAttachment): Record<string, unknown> {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: a.name,
    contentType: a.contentType,
    contentBytes: readFileSync(a.path).toString('base64'),
  }
}

function readChunk(path: string, start: number, length: number): Buffer {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(length)
    const read = readSync(fd, buf, 0, length, start)
    return buf.subarray(0, read)
  } finally {
    closeSync(fd)
  }
}

export class GraphMailProvider implements MailProvider {
  readonly kind = 'graph' as const

  constructor(
    private readonly auth: MicrosoftAuth,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAccount(): Promise<MailAccount | null> {
    const account = await this.auth.account()
    return account
      ? { provider: 'graph', email: account.username, name: account.name ?? account.username }
      : null
  }

  /** One Graph call with auth; a 401 triggers a single forced token refresh. */
  private async call(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = path.startsWith('https://') ? path : `${GRAPH_BASE_URL}${path}`
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.auth.accessToken(attempt > 0)
      let res: Response
      try {
        res = await this.fetchImpl(url, {
          method,
          signal,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        })
      } catch (cause) {
        if (signal?.aborted) throw cause
        throw new AppError('network', 'fetch failed', { cause })
      }
      if (res.status === 401 && attempt === 0) continue
      if (!res.ok) throw await toAppError(res)
      return res
    }
    throw new AppError('authExpired')
  }

  private messageBody(m: OutgoingMessage): Record<string, unknown> {
    return {
      subject: m.subject,
      body: { contentType: 'HTML', content: m.html },
      toRecipients: [{ emailAddress: { address: m.to.email, name: m.to.name || m.to.email } }],
      singleValueExtendedProperties: [{ id: SEND_ID_PROPERTY, value: m.sendId }],
    }
  }

  async send(m: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const total = m.attachments.reduce((sum, a) => sum + a.size, 0)
    // Base64 inflates by ~33 %; keep the JSON request under Graph's limit.
    if (total * 1.37 < GRAPH_INLINE_ATTACHMENT_LIMIT) {
      await withRetry(
        () =>
          this.call(
            'POST',
            '/me/sendMail',
            {
              message: { ...this.messageBody(m), attachments: m.attachments.map(fileAttachment) },
              saveToSentItems: true,
            },
            signal,
          ),
        {
          onRetry: ({ delayMs, error }) =>
            logger.warn(`[graph] ${error.code}, retrying in ${delayMs} ms`),
        },
        signal,
      )
      return {}
    }
    return this.sendLarge(m, signal)
  }

  /** Draft -> attachments (upload session for big files) -> send. */
  private async sendLarge(m: OutgoingMessage, signal?: AbortSignal): Promise<SendResult> {
    const retry = <T>(fn: () => Promise<T>): Promise<T> => withRetry(fn, {}, signal)
    const draft = (await (
      await retry(() => this.call('POST', '/me/messages', this.messageBody(m), signal))
    ).json()) as {
      id: string
    }
    try {
      for (const a of m.attachments) {
        if (a.size < GRAPH_INLINE_ATTACHMENT_LIMIT) {
          await retry(() =>
            this.call('POST', `/me/messages/${draft.id}/attachments`, fileAttachment(a), signal),
          )
          continue
        }
        const session = (await (
          await retry(() =>
            this.call(
              'POST',
              `/me/messages/${draft.id}/attachments/createUploadSession`,
              {
                AttachmentItem: {
                  attachmentType: 'file',
                  name: a.name,
                  size: a.size,
                  contentType: a.contentType,
                },
              },
              signal,
            ),
          )
        ).json()) as { uploadUrl: string }
        for (let start = 0; start < a.size; start += UPLOAD_CHUNK) {
          const chunk = readChunk(a.path, start, Math.min(UPLOAD_CHUNK, a.size - start))
          const end = start + chunk.length - 1
          await retry(async () => {
            let res: Response
            try {
              // The upload URL is pre-authenticated; no bearer token here.
              res = await this.fetchImpl(session.uploadUrl, {
                method: 'PUT',
                signal,
                headers: {
                  'Content-Length': String(chunk.length),
                  'Content-Range': `bytes ${start}-${end}/${a.size}`,
                },
                body: new Uint8Array(chunk),
              })
            } catch (cause) {
              throw new AppError('network', 'upload failed', { cause })
            }
            if (!res.ok) throw await toAppError(res)
          })
        }
      }
      await retry(() => this.call('POST', `/me/messages/${draft.id}/send`, undefined, signal))
      return { messageId: draft.id }
    } catch (error) {
      // Best effort: do not leave half-built drafts behind.
      await this.call('DELETE', `/me/messages/${draft.id}`).catch(() => undefined)
      throw error
    }
  }

  async wasSent(sendId: string): Promise<boolean | null> {
    try {
      const filter = `singleValueExtendedProperties/Any(ep: ep/id eq '${SEND_ID_PROPERTY}' and ep/value eq '${sendId.replace(/'/g, "''")}')`
      const res = await this.call(
        'GET',
        `/me/mailFolders/sentitems/messages?$top=1&$select=id&$filter=${encodeURIComponent(filter)}`,
      )
      const body = (await res.json()) as { value?: unknown[] }
      return (body.value?.length ?? 0) > 0
    } catch (error) {
      logger.warn(
        `[graph] could not verify a send: ${error instanceof AppError ? error.code : 'error'}`,
      )
      return null
    }
  }
}
