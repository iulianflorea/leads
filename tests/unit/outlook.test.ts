import { describe, expect, it, vi } from 'vitest'
import {
  OutlookDesktopProvider,
  toAppError,
  type OutlookRunner,
} from '../../src/main/mailer/outlook'
import { OUTLOOK_SCRIPT } from '../../src/main/mailer/outlook-script'

const message = {
  sendId: 'lm-7-1',
  to: { email: 'ana@x.ro', name: 'Ana' },
  subject: 'Oferta pentru Pompă',
  html: '<p>Bună ziua</p>',
  attachments: [
    { name: 'a.pdf', path: 'C:\\data\\pdfs\\a.pdf', size: 10, contentType: 'application/pdf' },
  ],
}

function provider(responses: Record<string, unknown>, preferred = '') {
  const run = vi.fn<OutlookRunner>(
    async (req) => (responses[req.action as string] ?? { ok: true }) as never,
  )
  return { run, p: new OutlookDesktopProvider(run, () => preferred) }
}

describe('OutlookDesktopProvider', () => {
  it('lists accounts, including the single-object form PowerShell 5.1 produces', async () => {
    const { p } = provider({
      accounts: { ok: true, accounts: { email: 'eu@firma.ro', name: 'Eu' } },
    })
    await expect(p.accounts()).resolves.toEqual([{ email: 'eu@firma.ro', name: 'Eu' }])
  })

  it('uses the preferred account, falling back to the first one', async () => {
    const accounts = {
      ok: true,
      accounts: [
        { email: 'a@x.ro', name: 'A' },
        { email: 'B@x.ro', name: 'B' },
      ],
    }
    expect(await provider({ accounts }, 'b@x.ro').p.getAccount()).toEqual({
      provider: 'outlook',
      email: 'B@x.ro',
      name: 'B',
    })
    expect(await provider({ accounts }, 'missing@x.ro').p.getAccount()).toMatchObject({
      email: 'a@x.ro',
    })
  })

  it('caches the account list between calls', async () => {
    const { p, run } = provider({
      accounts: { ok: true, accounts: [{ email: 'a@x.ro', name: 'A' }] },
    })
    await p.getAccount()
    await p.getAccount()
    expect(run).toHaveBeenCalledTimes(1)
    await p.accounts(true)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('sends with the chosen account, recipient, content, attachment paths and send id', async () => {
    const { p, run } = provider({
      accounts: { ok: true, accounts: [{ email: 'eu@firma.ro', name: 'Eu' }] },
    })
    await p.send(message)
    expect(run).toHaveBeenLastCalledWith({
      action: 'send',
      account: 'eu@firma.ro',
      to: 'ana@x.ro',
      subject: 'Oferta pentru Pompă',
      html: '<p>Bună ziua</p>',
      attachments: ['C:\\data\\pdfs\\a.pdf'],
      sendId: 'lm-7-1',
    })
  })

  it('maps Outlook failures to clear error codes', async () => {
    const accounts = { ok: true, accounts: [{ email: 'a@x.ro', name: 'A' }] }
    const unavailable = provider({
      accounts: { ok: false, code: 'outlookUnavailable', detail: 'class not registered' },
    })
    await expect(unavailable.p.getAccount()).rejects.toMatchObject({ code: 'outlookUnavailable' })
    const blocked = provider({
      accounts,
      send: { ok: false, code: 'outlookError', hresult: 0x80004004 | 0 },
    })
    await expect(blocked.p.send(message)).rejects.toMatchObject({ code: 'outlookBlocked' })
    const other = provider({ accounts, send: { ok: false, code: 'outlookError', detail: 'boom' } })
    await expect(other.p.send(message)).rejects.toMatchObject({ code: 'outlookError' })
  })

  it('reports whether a send exists, or null when it cannot tell', async () => {
    expect(await provider({ wasSent: { ok: true, found: true } }).p.wasSent('lm-1')).toBe(true)
    expect(await provider({ wasSent: { ok: true, found: false } }).p.wasSent('lm-1')).toBe(false)
    expect(
      await provider({ wasSent: { ok: false, code: 'outlookError' } }).p.wasSent('lm-1'),
    ).toBeNull()
    const throwing = new OutlookDesktopProvider(
      async () => {
        throw new Error('spawn failed')
      },
      () => '',
    )
    expect(await throwing.wasSent('lm-1')).toBeNull()
  })

  it('maps raw responses', () => {
    expect(toAppError({ ok: false, code: 'outlookUnavailable' }).code).toBe('outlookUnavailable')
    expect(toAppError({ ok: false, code: 'outlookError', detail: 'Operation aborted' }).code).toBe(
      'outlookBlocked',
    )
  })
})

describe('Outlook PowerShell script', () => {
  it('covers every action and stamps the send id header', () => {
    for (const action of ["'accounts'", "'send'", "'wasSent'"])
      expect(OUTLOOK_SCRIPT).toContain(action)
    expect(OUTLOOK_SCRIPT).toContain('x-leadmailer-send-id')
    expect(OUTLOOK_SCRIPT).toContain('New-Object -ComObject Outlook.Application')
    expect(OUTLOOK_SCRIPT).toContain('$mail.Send()')
  })
})
