import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RetryModule from '../../src/main/mailer/retry'

vi.mock('../../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
// Retries must not actually wait in tests.
vi.mock('../../src/main/mailer/retry', async (importOriginal) => {
  const mod = await importOriginal<typeof RetryModule>()
  return {
    ...mod,
    withRetry: (fn: (a: number) => Promise<unknown>, o: object = {}, s?: AbortSignal) =>
      mod.withRetry(fn, { ...o, sleep: async () => undefined }, s),
  }
})

const { GraphMailProvider } = await import('../../src/main/mailer/graph')
type Auth = ConstructorParameters<typeof GraphMailProvider>[0]

const dir = mkdtempSync(join(tmpdir(), 'lm-graph-'))
const small = join(dir, 'small.pdf')
writeFileSync(small, Buffer.alloc(10_000, 1))
const big = join(dir, 'big.pdf')
const BIG_SIZE = 5 * 1024 * 1024
writeFileSync(big, Buffer.alloc(BIG_SIZE, 2))

function fakeAuth(): Auth & { accessToken: ReturnType<typeof vi.fn> } {
  return {
    account: vi.fn(async () => ({ username: 'me@x.ro', name: 'Me' })),
    accessToken: vi.fn(async (force?: boolean) => (force ? 'fresh' : 'token')),
  } as unknown as Auth & { accessToken: ReturnType<typeof vi.fn> }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers })

const message = (attachments: Array<{ path: string; size: number }>) => ({
  sendId: 'lm-1-1',
  to: { email: 'ana@x.ro', name: 'Ana' },
  subject: 'Salut',
  html: '<p>Hi</p>',
  attachments: attachments.map((a) => ({ name: 'f.pdf', contentType: 'application/pdf', ...a })),
})

describe('GraphMailProvider', () => {
  let calls: Array<{ url: string; init: RequestInit }>
  beforeEach(() => {
    calls = []
  })

  it('sends small messages with /me/sendMail and saves to Sent Items', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return json(202, null)
    })
    const provider = new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch)
    await provider.send(message([{ path: small, size: 10_000 }]))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toMatch(/\/me\/sendMail$/)
    const body = JSON.parse(String(calls[0]!.init.body)) as {
      saveToSentItems: boolean
      message: {
        attachments: Array<{ contentBytes: string }>
        singleValueExtendedProperties: unknown[]
      }
    }
    expect(body.saveToSentItems).toBe(true)
    expect(body.message.attachments).toHaveLength(1)
    expect(body.message.singleValueExtendedProperties[0]).toMatchObject({ value: 'lm-1-1' })
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer token')
  })

  it('retries on 429 and honours Retry-After', async () => {
    let n = 0
    const fetchMock = vi.fn(async () =>
      n++ === 0
        ? json(429, { error: { code: 'TooManyRequests' } }, { 'retry-after': '3' })
        : json(202, null),
    )
    const provider = new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch)
    await provider.send(message([]))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('refreshes the token once on 401', async () => {
    const auth = fakeAuth()
    let n = 0
    const fetchMock = vi.fn(async () => (n++ === 0 ? json(401, {}) : json(202, null)))
    await new GraphMailProvider(auth, fetchMock as unknown as typeof fetch).send(message([]))
    expect(auth.accessToken).toHaveBeenLastCalledWith(true)
  })

  it('maps a persistent 401 to authExpired', async () => {
    const fetchMock = vi.fn(async () => json(401, {}))
    await expect(
      new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch).send(message([])),
    ).rejects.toMatchObject({ code: 'authExpired' })
  })

  it('maps invalid recipients to recipientRejected without retrying', async () => {
    const fetchMock = vi.fn(async () => json(400, { error: { code: 'ErrorInvalidRecipients' } }))
    await expect(
      new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch).send(message([])),
    ).rejects.toMatchObject({ code: 'recipientRejected' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses draft + upload session + send for large attachments', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/me/messages')) return json(201, { id: 'draft1' })
      if (url.endsWith('/createUploadSession'))
        return json(201, { uploadUrl: 'https://upload.example/x' })
      if (url.startsWith('https://upload.example')) return json(200, {})
      return json(202, null)
    })
    const provider = new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch)
    const result = await provider.send(message([{ path: big, size: BIG_SIZE }]))
    expect(result.messageId).toBe('draft1')
    const urls = calls.map((c) => c.url)
    expect(urls[0]).toMatch(/\/me\/messages$/)
    expect(urls[1]).toMatch(/\/me\/messages\/draft1\/attachments\/createUploadSession$/)
    const uploads = calls.filter((c) => c.url.startsWith('https://upload.example'))
    expect(uploads.length).toBe(2)
    const ranges = uploads.map((u) => (u.init.headers as Record<string, string>)['Content-Range'])
    expect(ranges[0]).toBe(`bytes 0-${320 * 1024 * 10 - 1}/${BIG_SIZE}`)
    expect(ranges[1]).toBe(`bytes ${320 * 1024 * 10}-${BIG_SIZE - 1}/${BIG_SIZE}`)
    // The pre-authenticated upload URL must not receive the bearer token.
    expect((uploads[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(urls.at(-1)).toMatch(/\/me\/messages\/draft1\/send$/)
  })

  it('deletes the draft when a large send fails', async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/me/messages')) return json(201, { id: 'd2' })
      if (url.endsWith('/createUploadSession')) return json(400, { error: { code: 'Bad' } })
      return json(204, null)
    })
    await expect(
      new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch).send(
        message([{ path: big, size: BIG_SIZE }]),
      ),
    ).rejects.toBeTruthy()
    expect(calls.some((c) => c.init.method === 'DELETE' && c.url.endsWith('/me/messages/d2'))).toBe(
      true,
    )
  })

  it('verifies a send through the extended property filter', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      calls.push({ url, init: {} })
      return json(200, { value: [{ id: 'm' }] })
    })
    const provider = new GraphMailProvider(fakeAuth(), fetchMock as unknown as typeof fetch)
    await expect(provider.wasSent('lm-1-1')).resolves.toBe(true)
    expect(decodeURIComponent(calls[0]!.url)).toContain("ep/value eq 'lm-1-1'")
  })
})
