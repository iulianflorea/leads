import { shell } from 'electron'
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type ICachePlugin,
  LogLevel,
} from '@azure/msal-node'
import { isValidClientId, MS_AUTHORITY, MS_CLIENT_ID, MS_SCOPES } from '@shared/config'
import type { ClientIdSource } from '@shared/schemas/mail'
import { AppError } from '@shared/errors'
import { t } from '@shared/i18n'
import { logger } from '../logger'
import { secureStore } from './secure-store'

const SCOPES = [...MS_SCOPES]

declare const __BUILD_MS_CLIENT_ID__: string

function buildTimeClientId(): string {
  return typeof __BUILD_MS_CLIENT_ID__ === 'string' ? __BUILD_MS_CLIENT_ID__.trim() : ''
}

/**
 * Picks the Microsoft Client ID. Priority: LEADMAILER_MS_CLIENT_ID env var > ID saved from
 * Settings > ID injected at build time > constant in shared/config.ts.
 */
export function resolveClientId(sources: {
  env?: string
  saved?: string
  build?: string
  code?: string
}): { id: string; source: ClientIdSource } {
  const pick: Array<[ClientIdSource, string | undefined]> = [
    ['env', sources.env],
    ['settings', sources.saved],
    ['build', sources.build],
    ['code', sources.code],
  ]
  for (const [source, value] of pick) {
    if (value && isValidClientId(value)) return { id: value.trim(), source }
  }
  return { id: '', source: 'none' }
}

function page(title: string, message: string): string {
  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f5f5f7;color:#1d1d1f}
main{text-align:center;max-width:420px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 8px}p{color:#6e6e73;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`
}

/**
 * Microsoft sign-in with MSAL: authorization code + PKCE in the system browser, redirect to
 * a loopback http://localhost port opened by MSAL. The token cache is encrypted on disk.
 */
export class MicrosoftAuth {
  private pca: PublicClientApplication | null = null
  private pcaClientId = ''
  private lastClientId: string

  constructor(
    private readonly cacheFile: string,
    private readonly savedClientId: () => string,
  ) {
    this.lastClientId = this.clientId().id
  }

  clientId(): { id: string; source: ClientIdSource } {
    return resolveClientId({
      env: process.env.LEADMAILER_MS_CLIENT_ID,
      saved: this.savedClientId(),
      build: buildTimeClientId(),
      code: MS_CLIENT_ID,
    })
  }

  get configured(): boolean {
    return this.clientId().source !== 'none'
  }

  /**
   * Call after settings change. Tokens belong to one app registration, so switching the
   * Client ID signs out and clears the token cache.
   */
  syncClientId(): void {
    const current = this.clientId().id
    if (current === this.lastClientId) return
    this.lastClientId = current
    this.pca = null
    secureStore.removeFile(this.cacheFile)
    logger.info('[auth] Microsoft Client ID changed; signed out')
  }

  private client(): PublicClientApplication {
    const { id } = this.clientId()
    if (!id) throw new AppError('authNotConfigured')
    if (this.pca && this.pcaClientId === id) return this.pca
    const file = this.cacheFile
    const cachePlugin: ICachePlugin = {
      beforeCacheAccess: async (ctx) => {
        const data = secureStore.readFile(file)
        if (data) ctx.tokenCache.deserialize(data)
      },
      afterCacheAccess: async (ctx) => {
        if (ctx.cacheHasChanged) secureStore.writeFile(file, ctx.tokenCache.serialize())
      },
    }
    this.pca = new PublicClientApplication({
      auth: { clientId: id, authority: MS_AUTHORITY },
      cache: { cachePlugin },
      system: {
        loggerOptions: {
          piiLoggingEnabled: false,
          logLevel: LogLevel.Warning,
          loggerCallback: (level, message, containsPii) => {
            if (!containsPii && level <= LogLevel.Warning) logger.warn(`[msal] ${message}`)
          },
        },
      },
    })
    this.pcaClientId = id
    return this.pca
  }

  async account(): Promise<AccountInfo | null> {
    if (!this.configured) return null
    const accounts = await this.client().getTokenCache().getAllAccounts()
    return accounts[0] ?? null
  }

  /** Opens the system browser for sign-in and returns the signed-in account. */
  async login(): Promise<AccountInfo> {
    const pca = this.client()
    try {
      // Only one account at a time: switching account replaces the previous one.
      for (const a of await pca.getTokenCache().getAllAccounts())
        await pca.getTokenCache().removeAccount(a)
      const result = await pca.acquireTokenInteractive({
        scopes: SCOPES,
        prompt: 'select_account',
        openBrowser: async (url) => {
          await shell.openExternal(url)
        },
        successTemplate: page(t('auth.browserSuccessTitle'), t('auth.browserSuccessText')),
        errorTemplate: page(t('auth.browserErrorTitle'), t('auth.browserErrorText')),
      })
      if (!result.account) throw new AppError('authRequired', 'no account returned')
      logger.info('[auth] signed in to Microsoft')
      return result.account
    } catch (error) {
      if (error instanceof AppError) throw error
      const code = (error as { errorCode?: string }).errorCode ?? ''
      logger.warn(`[auth] interactive sign-in failed: ${code}`)
      if (/cancel|user_cancelled|access_denied/i.test(code))
        throw new AppError('authCancelled', code)
      throw new AppError('authRequired', code, { cause: error })
    }
  }

  async logout(): Promise<void> {
    if (!this.configured) return
    const pca = this.client()
    for (const a of await pca.getTokenCache().getAllAccounts())
      await pca.getTokenCache().removeAccount(a)
    secureStore.removeFile(this.cacheFile)
    logger.info('[auth] signed out of Microsoft')
  }

  /** Silent token for Graph; refreshes with the refresh token when needed. */
  async accessToken(forceRefresh = false): Promise<string> {
    const account = await this.account()
    if (!account) throw new AppError('authRequired')
    try {
      const result = await this.client().acquireTokenSilent({
        account,
        scopes: SCOPES,
        forceRefresh,
      })
      return result.accessToken
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError)
        throw new AppError('authExpired', error.errorCode)
      const code = (error as { errorCode?: string }).errorCode ?? ''
      if (/network|fetch|ENOTFOUND|ECONN/i.test(code + String(error)))
        throw new AppError('network', code)
      throw new AppError('authExpired', code, { cause: error })
    }
  }
}
