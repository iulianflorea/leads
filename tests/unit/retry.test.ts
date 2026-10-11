import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@shared/errors'
import { backoffDelay, parseRetryAfter, withRetry } from '../../src/main/mailer/retry'

const instant = { sleep: vi.fn(async () => undefined), random: () => 0.5 }

describe('withRetry', () => {
  it('returns on first success', async () => {
    await expect(withRetry(async () => 'ok', instant)).resolves.toBe('ok')
  })

  it('retries throttling and network errors, then succeeds', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls === 1) throw new AppError('throttled', '429', { retryAfterMs: 2000 })
        if (calls === 2) throw new AppError('network')
        return 'sent'
      },
      { ...instant, sleep: vi.fn(async () => undefined) },
    )
    expect(result).toBe('sent')
    expect(calls).toBe(3)
  })

  it('does not retry permanent errors', async () => {
    const fn = vi.fn(async () => {
      throw new AppError('recipientRejected')
    })
    await expect(withRetry(fn, instant)).rejects.toMatchObject({ code: 'recipientRejected' })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('gives up after the configured number of retries', async () => {
    const fn = vi.fn(async () => {
      throw new AppError('throttled')
    })
    await expect(withRetry(fn, { ...instant, retries: 3 })).rejects.toMatchObject({
      code: 'throttled',
    })
    expect(fn).toHaveBeenCalledTimes(4)
  })

  it('reports retries and honours Retry-After', async () => {
    const onRetry = vi.fn()
    const sleep = vi.fn(async () => undefined)
    let calls = 0
    await withRetry(
      async () => {
        if (calls++ === 0) throw new AppError('throttled', '429', { retryAfterMs: 30_000 })
        return 1
      },
      { ...instant, sleep, onRetry },
    )
    expect(sleep).toHaveBeenCalledWith(30_000, undefined)
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, delayMs: 30_000 }))
  })
})

describe('backoffDelay', () => {
  const o = { baseDelayMs: 1000, maxDelayMs: 60_000, random: () => 0.5 }
  it('grows exponentially and is capped', () => {
    const e = new AppError('network')
    expect(backoffDelay(0, e, o)).toBe(1000)
    expect(backoffDelay(3, e, o)).toBe(8000)
    expect(backoffDelay(10, e, o)).toBe(60_000)
  })
  it('applies jitter within 20 %', () => {
    const e = new AppError('network')
    expect(backoffDelay(2, e, { ...o, random: () => 0 })).toBe(3200)
    expect(backoffDelay(2, e, { ...o, random: () => 1 })).toBe(4800)
  })
})

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('120')).toBe(120_000)
    expect(
      parseRetryAfter('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT')),
    ).toBe(10_000)
    expect(parseRetryAfter(null)).toBeUndefined()
    expect(parseRetryAfter('soon')).toBeUndefined()
  })
})
