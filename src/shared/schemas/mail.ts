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
  /** Where the Microsoft Client ID comes from; "env" cannot be changed from the UI. */
  clientIdSource: ClientIdSource
}

export interface OutlookAccount {
  email: string
  name: string
}

export type ClientIdSource = 'env' | 'settings' | 'build' | 'code' | 'none'
