import type { MailProviderKind } from './settings'

export interface MailAccount {
  provider: MailProviderKind
  email: string
  name: string
}

export interface AccountStatus {
  provider: MailProviderKind
  account: MailAccount | null
  /** False when the provider cannot be used yet (no Client ID, SMTP not filled in). */
  configured: boolean
  /** SMTP password stored (never returned itself). */
  hasSmtpPassword: boolean
}
