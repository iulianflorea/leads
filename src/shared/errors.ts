/**
 * Error codes that cross the IPC boundary. Each code maps to a human-readable
 * message (and suggested action) in the i18n dictionary under `errors.<code>`.
 */
export const errorCodes = [
  'unknown',
  'validation',
  'notFound',
  'authRequired',
  'authExpired',
  'authCancelled',
  'authNotConfigured',
  'network',
  'throttled',
  'mailboxUnavailable',
  'recipientRejected',
  'attachmentTooLarge',
  'smtpNotConfigured',
  'smtpAuthFailed',
  'smtpConnection',
  'fileUnreadable',
  'fileUnsupported',
  'pdfMissing',
  'duplicate',
  'jobNotResumable',
  'backupInvalid',
  'outlookUnavailable',
  'outlookBlocked',
  'outlookError',
] as const

export type ErrorCode = (typeof errorCodes)[number]

export interface SerializedError {
  code: ErrorCode
  /** Technical detail; never contains lead personal data. Shown only in "details". */
  detail?: string
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly detail?: string
  readonly retryAfterMs?: number

  constructor(
    code: ErrorCode,
    detail?: string,
    options?: { cause?: unknown; retryAfterMs?: number },
  ) {
    super(detail ? `${code}: ${detail}` : code, { cause: options?.cause })
    this.name = 'AppError'
    this.code = code
    this.detail = detail
    this.retryAfterMs = options?.retryAfterMs
  }

  toJSON(): SerializedError {
    return { code: this.code, detail: this.detail }
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (errorCodes as readonly string[]).includes(value)
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: SerializedError }
