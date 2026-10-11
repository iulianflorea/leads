import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@shared/errors'
import type { MailAccount, OutlookAccount } from '@shared/schemas/mail'
import { OUTLOOK_SCRIPT } from './outlook-script'
import type { MailProvider, OutgoingMessage, SendResult } from './types'

export interface OutlookResponse {
  ok: boolean
  code?: string
  detail?: string
  hresult?: number
  accounts?: OutlookAccount[] | OutlookAccount
  found?: boolean
}

/** Runs one request against Outlook; injectable so the provider can be tested anywhere. */
export type OutlookRunner = (request: Record<string, unknown>) => Promise<OutlookResponse>

/** E_ABORT: the user denied Outlook's "a program is trying to send email" prompt. */
const E_ABORT = 0x80004004 | 0

export function toAppError(r: OutlookResponse): AppError {
  if (r.code === 'outlookUnavailable') return new AppError('outlookUnavailable', r.detail)
  if (r.hresult === E_ABORT || /abort|denied|refuz/i.test(r.detail ?? '')) {
    return new AppError('outlookBlocked', r.detail)
  }
  return new AppError('outlookError', r.detail)
}

/**
 * Runner that spawns Windows PowerShell with the bundled script. The request (which contains
 * the email) goes through a temporary file that is deleted right after.
 */
export function powershellRunner(workDir: () => string, timeoutMs = 120_000): OutlookRunner {
  let scriptPath: string | null = null
  return (request) =>
    new Promise((resolve, reject) => {
      if (process.platform !== 'win32') {
        reject(new AppError('outlookUnavailable', 'not windows'))
        return
      }
      const dir = join(workDir(), 'outlook')
      mkdirSync(dir, { recursive: true })
      if (!scriptPath) {
        scriptPath = join(dir, 'leadmailer-outlook.ps1')
        // UTF-8 with BOM so Windows PowerShell 5.1 reads non-ASCII text correctly.
        writeFileSync(scriptPath, '﻿' + OUTLOOK_SCRIPT, 'utf8')
      }
      const input = join(dir, `${randomUUID()}.json`)
      writeFileSync(input, JSON.stringify(request), 'utf8')
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-InputPath',
          input,
        ],
        { windowsHide: true },
      )
      let out = ''
      let err = ''
      const timer = setTimeout(() => {
        child.kill()
        reject(new AppError('outlookBlocked', 'timeout'))
      }, timeoutMs)
      child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')))
      child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')))
      child.on('error', (e) => {
        clearTimeout(timer)
        rmSync(input, { force: true })
        reject(new AppError('outlookUnavailable', e.message))
      })
      child.on('close', () => {
        clearTimeout(timer)
        rmSync(input, { force: true })
        const line = out.trim().split(/\r?\n/).pop() ?? ''
        try {
          resolve(JSON.parse(line) as OutlookResponse)
        } catch {
          reject(new AppError('outlookError', (err || out).slice(0, 300)))
        }
      })
    })
}

/**
 * Sends through classic Outlook for Windows installed on this computer, using the account
 * already signed in there (no Azure registration needed). Messages go through Outlook's
 * Outbox and are saved in Sent Items by Outlook itself.
 */
export class OutlookDesktopProvider implements MailProvider {
  readonly kind = 'outlook' as const
  private cache: { at: number; accounts: OutlookAccount[] } | null = null

  constructor(
    private readonly run: OutlookRunner,
    private readonly preferredAccount: () => string,
  ) {}

  get supported(): boolean {
    return process.platform === 'win32'
  }

  async accounts(force = false): Promise<OutlookAccount[]> {
    if (!force && this.cache && Date.now() - this.cache.at < 60_000) return this.cache.accounts
    const r = await this.run({ action: 'accounts' })
    if (!r.ok) throw toAppError(r)
    // PowerShell 5.1 serializes a one-element array as a plain object.
    const raw = r.accounts ?? []
    const accounts = (Array.isArray(raw) ? raw : [raw]).filter((a) => a.email)
    this.cache = { at: Date.now(), accounts }
    return accounts
  }

  private chosen(accounts: OutlookAccount[]): OutlookAccount | null {
    const wanted = this.preferredAccount().toLowerCase()
    return accounts.find((a) => a.email.toLowerCase() === wanted) ?? accounts[0] ?? null
  }

  async getAccount(): Promise<MailAccount | null> {
    const account = this.chosen(await this.accounts())
    return account
      ? { provider: 'outlook', email: account.email, name: account.name || account.email }
      : null
  }

  async send(m: OutgoingMessage): Promise<SendResult> {
    const account = this.chosen(await this.accounts())
    const r = await this.run({
      action: 'send',
      account: account?.email ?? '',
      to: m.to.email,
      subject: m.subject,
      html: m.html,
      attachments: m.attachments.map((a) => a.path),
      sendId: m.sendId,
    })
    if (!r.ok) throw toAppError(r)
    return {}
  }

  async wasSent(sendId: string): Promise<boolean | null> {
    try {
      const r = await this.run({ action: 'wasSent', sendId })
      return r.ok ? !!r.found : null
    } catch {
      return null
    }
  }

  reset(): void {
    this.cache = null
  }
}
