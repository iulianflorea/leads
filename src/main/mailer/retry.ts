import { AppError } from '@shared/errors'

export interface RetryOptions {
  retries: number
  baseDelayMs: number
  maxDelayMs: number
  sleep(ms: number, signal?: AbortSignal): Promise<void>
  random(): number
  /** Called before waiting, e.g. to report "throttled, retrying in 30 s". */
  onRetry?(info: { attempt: number; delayMs: number; error: AppError }): void
}

export const defaultRetryOptions: RetryOptions = {
  retries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  sleep: (ms, signal) =>
    new Promise((resolve, reject) => {
      const id = setTimeout(resolve, ms)
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(id)
          reject(new AppError('unknown', 'aborted'))
        },
        { once: true },
      )
    }),
  random: Math.random,
}

/** Errors worth retrying automatically: throttling and transient network/server issues. */
export function isTransient(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    (error.code === 'throttled' || error.code === 'network' || error.code === 'mailboxUnavailable')
  )
}

/**
 * Exponential backoff with jitter: base * 2^attempt (+/-20 %), capped. A server-provided
 * Retry-After always wins (it is what Microsoft asks for).
 */
export function backoffDelay(
  attempt: number,
  error: AppError,
  o: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs' | 'random'>,
): number {
  if (error.retryAfterMs !== undefined) return Math.min(error.retryAfterMs, 10 * 60_000)
  const exp = o.baseDelayMs * 2 ** attempt
  const jitter = exp * 0.2 * (o.random() * 2 - 1)
  return Math.round(Math.min(o.maxDelayMs, exp + jitter))
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {},
  signal?: AbortSignal,
): Promise<T> {
  const o = { ...defaultRetryOptions, ...options }
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      if (!isTransient(error) || attempt >= o.retries || signal?.aborted) throw error
      const delayMs = backoffDelay(attempt, error, o)
      o.onRetry?.({ attempt: attempt + 1, delayMs, error })
      await o.sleep(delayMs, signal)
    }
  }
}

/** Parses an HTTP Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - now)
}
