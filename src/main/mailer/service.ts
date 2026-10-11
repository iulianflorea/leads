import { join } from 'node:path'
import { mailProviderKindSchema, type MailProviderKind } from '@shared/schemas/settings'
import type { AccountStatus } from '@shared/schemas/mail'
import { AppError } from '@shared/errors'
import type { SettingsService } from '../services/settings'
import type { SqliteSettingsStore } from '../repos/settings'
import { MicrosoftAuth } from '../auth/microsoft'
import { secureStore } from '../auth/secure-store'
import { GraphMailProvider } from './graph'
import { SmtpMailProvider } from './smtp'
import { MockMailProvider } from './mock'
import { OutlookDesktopProvider, powershellRunner } from './outlook'
import type { OutlookAccount } from '@shared/schemas/mail'
import type { MailProvider } from './types'

const SMTP_PASSWORD_KEY = 'secret.smtpPassword'

/** Chooses the active mail provider and manages accounts and credentials. */
export class MailService {
  readonly microsoft: MicrosoftAuth
  private readonly graph: GraphMailProvider
  private readonly smtp: SmtpMailProvider
  private readonly mock: MockMailProvider
  private readonly outlook: OutlookDesktopProvider
  /** Fallback when the OS keychain is unavailable: kept for this session only. */
  private sessionSmtpPassword: string | null = null

  constructor(
    private readonly settings: SettingsService,
    private readonly store: SqliteSettingsStore,
    dataDir: () => string,
  ) {
    this.microsoft = new MicrosoftAuth(
      join(dataDir(), 'auth-cache.bin'),
      () => this.settings.get().msClientId,
    )
    this.graph = new GraphMailProvider(this.microsoft)
    this.smtp = new SmtpMailProvider(
      () => this.settings.get().smtp,
      () => this.smtpPassword(),
    )
    this.mock = new MockMailProvider(() => join(dataDir(), 'mock-outbox'))
    this.outlook = new OutlookDesktopProvider(
      powershellRunner(dataDir),
      () => this.settings.get().outlookAccount,
    )
  }

  /** LEADMAILER_MAIL_PROVIDER overrides the setting (used by tests and demos). */
  kind(): MailProviderKind {
    const forced = mailProviderKindSchema.safeParse(process.env.LEADMAILER_MAIL_PROVIDER)
    return forced.success ? forced.data : this.settings.get().mailProvider
  }

  provider(): MailProvider {
    const kind = this.kind()
    if (kind === 'graph') return this.graph
    if (kind === 'outlook') return this.outlook
    return kind === 'smtp' ? this.smtp : this.mock
  }

  async status(): Promise<AccountStatus> {
    const kind = this.kind()
    const configured =
      kind === 'graph'
        ? this.microsoft.configured
        : kind === 'smtp'
          ? this.smtp.configured
          : kind === 'outlook'
            ? this.outlook.supported
            : true
    const account = configured
      ? await this.provider()
          .getAccount()
          .catch(() => null)
      : null
    return {
      provider: kind,
      account,
      configured,
      hasSmtpPassword: !!this.smtpPassword(),
      clientIdSource: this.microsoft.clientId().source,
    }
  }

  async login(): Promise<AccountStatus> {
    if (this.kind() === 'graph') await this.microsoft.login()
    return this.status()
  }

  async logout(): Promise<AccountStatus> {
    if (this.kind() === 'graph') await this.microsoft.logout()
    return this.status()
  }

  /** Throws a human-actionable error when sending is not possible right now. */
  async requireAccount(): Promise<void> {
    const status = await this.status()
    if (!status.configured) {
      throw new AppError(
        status.provider === 'smtp'
          ? 'smtpNotConfigured'
          : status.provider === 'outlook'
            ? 'outlookUnavailable'
            : 'authNotConfigured',
      )
    }
    if (!status.account)
      throw new AppError(status.provider === 'outlook' ? 'outlookUnavailable' : 'authRequired')
  }

  smtpPassword(): string | null {
    const stored = this.store.getRaw(SMTP_PASSWORD_KEY)
    if (stored) return secureStore.decrypt(JSON.parse(stored) as string)
    return this.sessionSmtpPassword
  }

  setSmtpPassword(password: string | null): void {
    this.smtp.reset()
    this.sessionSmtpPassword = null
    if (!password) {
      this.store.setRaw(SMTP_PASSWORD_KEY, null)
      return
    }
    const encrypted = secureStore.encrypt(password)
    if (encrypted) this.store.setRaw(SMTP_PASSWORD_KEY, JSON.stringify(encrypted))
    else this.sessionSmtpPassword = password
  }

  async testSmtp(): Promise<void> {
    this.smtp.reset()
    await this.smtp.verify()
  }

  /** Accounts configured in classic Outlook on this computer (refreshes the cache). */
  async outlookAccounts(): Promise<OutlookAccount[]> {
    return this.outlook.accounts(true)
  }

  onSettingsChanged(): void {
    this.outlook.reset()
    this.microsoft.syncClientId()
    this.smtp.reset()
  }
}
