/** Single source of truth for the app name (provisional). */
export const APP_NAME = 'LeadMailer'
export const APP_ID = 'com.leadmailer.app'

/**
 * Microsoft Entra ID (Azure) application (client) ID.
 * Register the app as described in the README, then paste the ID here
 * or provide it at build/run time through the LEADMAILER_MS_CLIENT_ID env var.
 */
export const MS_CLIENT_ID = '00000000-0000-0000-0000-000000000000'
export const MS_AUTHORITY = 'https://login.microsoftonline.com/common'
export const MS_SCOPES = ['Mail.Send', 'Mail.ReadWrite', 'User.Read', 'offline_access'] as const
export const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

/** Messages whose attachments exceed this size go through draft + upload session. */
export const GRAPH_INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024
/** Hard upper bound for a single PDF accepted by the app. */
export const MAX_PDF_SIZE = 25 * 1024 * 1024

export const DEFAULT_SEND_INTERVAL_SECONDS = 2

export function isPlaceholderClientId(id: string): boolean {
  return /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)
}

/** An Entra application (client) ID is a GUID, e.g. 3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b. */
export function isValidClientId(id: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim()) &&
    !isPlaceholderClientId(id.trim())
  )
}
