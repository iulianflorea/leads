import { describe, expect, it, vi } from 'vitest'
import type { JobStatus, SendOutcome, SendStatus } from '@shared/schemas/send'
import { SendQueue, type QueueEvent, type QueueStore } from '../../src/main/queue/send-queue'

class MemoryStore implements QueueStore {
  jobs = new Map<number, { status: JobStatus; reason: string | null }>()
  rows = new Map<number, { jobId: number; status: SendStatus; attempts: number }>()

  addJob(jobId: number, rowIds: number[], status: SendStatus = 'queued'): void {
    this.jobs.set(jobId, { status: 'running', reason: null })
    for (const id of rowIds) this.rows.set(id, { jobId, status, attempts: 0 })
  }
  jobStatus(jobId: number): JobStatus | null {
    return this.jobs.get(jobId)?.status ?? null
  }
  setJobStatus(jobId: number, status: JobStatus, reason: string | null = null): void {
    this.jobs.set(jobId, { status, reason })
  }
  nextQueued(jobId: number): number | null {
    for (const [id, r] of [...this.rows].sort((a, b) => a[0] - b[0])) {
      if (r.jobId === jobId && r.status === 'queued') return id
    }
    return null
  }
  cancelQueued(jobId: number): void {
    for (const r of this.rows.values())
      if (r.jobId === jobId && r.status === 'queued') r.status = 'cancelled'
  }
  requeueFailed(jobId: number): number {
    let n = 0
    for (const r of this.rows.values()) {
      if (r.jobId === jobId && r.status === 'failed') {
        r.status = 'queued'
        n++
      }
    }
    return n
  }
  statuses(jobId: number): SendStatus[] {
    return [...this.rows]
      .filter(([, r]) => r.jobId === jobId)
      .sort((a, b) => a[0] - b[0])
      .map(([, r]) => r.status)
  }
}

/** Delivery stub: marks rows sent unless told otherwise. Never sends a row twice. */
function makeDeliver(
  store: MemoryStore,
  behaviour: (id: number, attempt: number) => SendOutcome['status'] | string = () => 'sent',
) {
  const sent: number[] = []
  const deliver = vi.fn(async (id: number): Promise<SendOutcome> => {
    const row = store.rows.get(id)!
    if (row.status !== 'queued') return { sendId: id, status: row.status, errorCode: null }
    if (sent.includes(id)) throw new Error(`row ${id} delivered twice`)
    row.attempts++
    const result = behaviour(id, row.attempts)
    if (result === 'sent') {
      row.status = 'sent'
      sent.push(id)
      return { sendId: id, status: 'sent', errorCode: null }
    }
    if (result === 'failed') {
      row.status = 'failed'
      return { sendId: id, status: 'failed', errorCode: 'recipientRejected' }
    }
    // Account error: row stays queued.
    return { sendId: id, status: 'queued', errorCode: result }
  })
  return { deliver, sent }
}

function makeQueue(
  store: MemoryStore,
  deliver: (id: number) => Promise<SendOutcome>,
  sleep?: (ms: number, s: AbortSignal) => Promise<void>,
) {
  const events: QueueEvent[] = []
  const sleeps: number[] = []
  const queue = new SendQueue(
    store,
    deliver,
    {
      intervalMs: () => 2000,
      sleep:
        sleep ??
        (async (ms) => {
          sleeps.push(ms)
        }),
      now: () => 0,
      pauseOn: new Set(['authExpired', 'authRequired']),
    },
    (e) => events.push(e),
  )
  return { queue, events, sleeps }
}

describe('SendQueue', () => {
  it('sends every queued row once, spaced by the interval, then completes', async () => {
    const store = new MemoryStore()
    store.addJob(1, [10, 11, 12])
    const { deliver, sent } = makeDeliver(store)
    const { queue, events, sleeps } = makeQueue(store, deliver)
    queue.start(1)
    await queue.idle()
    expect(sent).toEqual([10, 11, 12])
    expect(sleeps).toEqual([2000, 2000])
    expect(store.jobStatus(1)).toBe('completed')
    expect(events.at(-1)).toEqual({ type: 'completed', jobId: 1 })
  })

  it('continues after a failed recipient and retries only failed rows', async () => {
    const store = new MemoryStore()
    store.addJob(1, [1, 2, 3])
    const { deliver } = makeDeliver(store, (id, attempt) =>
      id === 2 && attempt === 1 ? 'failed' : 'sent',
    )
    const { queue } = makeQueue(store, deliver)
    queue.start(1)
    await queue.idle()
    expect(store.statuses(1)).toEqual(['sent', 'failed', 'sent'])
    expect(queue.retryFailed(1)).toBe(1)
    await queue.idle()
    expect(store.statuses(1)).toEqual(['sent', 'sent', 'sent'])
    expect(deliver).toHaveBeenCalledTimes(4)
  })

  it('pauses the whole job on an account error and resumes where it stopped', async () => {
    const store = new MemoryStore()
    store.addJob(1, [1, 2, 3])
    let expired = true
    const { deliver, sent } = makeDeliver(store, (id) =>
      id === 2 && expired ? 'authExpired' : 'sent',
    )
    const { queue, events } = makeQueue(store, deliver)
    queue.start(1)
    await queue.idle()
    expect(store.jobStatus(1)).toBe('paused')
    expect(events).toContainEqual({ type: 'paused', jobId: 1, reason: 'authExpired' })
    expect(store.statuses(1)).toEqual(['sent', 'queued', 'queued'])
    expired = false
    queue.resume(1)
    await queue.idle()
    expect(sent).toEqual([1, 2, 3])
    expect(store.jobStatus(1)).toBe('completed')
  })

  it('pause during the wait stops before the next email; resume continues', async () => {
    const store = new MemoryStore()
    store.addJob(1, [1, 2, 3])
    const { deliver, sent } = makeDeliver(store)
    let release: () => void = () => undefined
    const { queue } = makeQueue(
      store,
      deliver,
      (_ms, signal) =>
        new Promise<void>((resolve, reject) => {
          release = resolve
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    queue.start(1)
    await vi.waitFor(() => expect(sent).toEqual([1]))
    queue.pause(1)
    await queue.idle()
    expect(sent).toEqual([1])
    expect(store.jobStatus(1)).toBe('paused')

    queue.resume(1)
    await vi.waitFor(() => expect(sent).toEqual([1, 2]))
    release()
    await vi.waitFor(() => expect(sent).toEqual([1, 2, 3]))
    await queue.idle()
  })

  it('cancel marks remaining rows cancelled and never sends them', async () => {
    const store = new MemoryStore()
    store.addJob(1, [1, 2, 3])
    const { deliver, sent } = makeDeliver(store)
    const { queue } = makeQueue(
      store,
      deliver,
      (_ms, signal) =>
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('x'))),
        ),
    )
    queue.start(1)
    await vi.waitFor(() => expect(sent).toEqual([1]))
    queue.cancel(1)
    await queue.idle()
    expect(store.statuses(1)).toEqual(['sent', 'cancelled', 'cancelled'])
    expect(store.jobStatus(1)).toBe('cancelled')
    queue.resume(1)
    await queue.idle()
    expect(sent).toEqual([1])
  })

  it('a restarted queue only sends rows still queued (idempotent resume)', async () => {
    const store = new MemoryStore()
    store.addJob(1, [1, 2, 3, 4])
    store.rows.get(1)!.status = 'sent'
    store.rows.get(2)!.status = 'sent'
    store.setJobStatus(1, 'paused')
    const { deliver, sent } = makeDeliver(store)
    const { queue } = makeQueue(store, deliver)
    queue.resume(1)
    await queue.idle()
    expect(sent).toEqual([3, 4])
  })

  it('runs jobs one after another', async () => {
    const store = new MemoryStore()
    store.addJob(1, [1, 2])
    store.addJob(2, [3])
    const { deliver, sent } = makeDeliver(store)
    const { queue } = makeQueue(store, deliver)
    queue.start(1)
    queue.start(2)
    await queue.idle()
    expect(sent).toEqual([1, 2, 3])
    expect(store.jobStatus(2)).toBe('completed')
  })
})
