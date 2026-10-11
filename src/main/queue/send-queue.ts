import type { JobStatus, SendOutcome } from '@shared/schemas/send'

/** Persistence used by the queue (backed by SQLite in the app, in-memory in tests). */
export interface QueueStore {
  jobStatus(jobId: number): JobStatus | null
  setJobStatus(jobId: number, status: JobStatus, pausedReason?: string | null): void
  /** Oldest row of the job still in "queued" state. */
  nextQueued(jobId: number): number | null
  /** Marks every queued row of the job as cancelled. */
  cancelQueued(jobId: number): void
  /** Moves failed rows back to queued; returns how many. */
  requeueFailed(jobId: number): number
}

export interface QueueOptions {
  intervalMs(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
  now(): number
  /** Error codes that pause the whole job (fix the account, then resume). */
  pauseOn: ReadonlySet<string>
}

export type QueueEvent =
  | { type: 'progress'; jobId: number; nextAt: number | null }
  | { type: 'paused'; jobId: number; reason: string | null }
  | { type: 'completed'; jobId: number }
  | { type: 'cancelled'; jobId: number }

/**
 * Sends the queued rows of one job at a time, spaced by the configured interval.
 * State lives in the store, so the queue can stop at any point (pause, cancel, app quit)
 * and resume later without re-sending anything already sent.
 */
export class SendQueue {
  private running: number | null = null
  private waiting: number[] = []
  private sleepAbort: AbortController | null = null
  private loop: Promise<void> | null = null

  constructor(
    private readonly store: QueueStore,
    private readonly deliver: (sendId: number) => Promise<SendOutcome>,
    private readonly options: QueueOptions,
    private readonly emit: (event: QueueEvent) => void,
  ) {}

  get activeJob(): number | null {
    return this.running
  }

  /** Schedules a job; jobs run one after another in FIFO order. */
  start(jobId: number): void {
    this.store.setJobStatus(jobId, 'running', null)
    if (this.running !== jobId && !this.waiting.includes(jobId)) this.waiting.push(jobId)
    this.kick()
  }

  pause(jobId: number, reason: string | null = null): void {
    if (this.store.jobStatus(jobId) !== 'running') return
    this.store.setJobStatus(jobId, 'paused', reason)
    this.waiting = this.waiting.filter((id) => id !== jobId)
    if (this.running === jobId) this.sleepAbort?.abort()
    this.emit({ type: 'paused', jobId, reason })
  }

  resume(jobId: number): void {
    const status = this.store.jobStatus(jobId)
    if (status === 'paused' || status === 'completed') this.start(jobId)
  }

  cancel(jobId: number): void {
    const status = this.store.jobStatus(jobId)
    if (status === null || status === 'cancelled') return
    this.store.setJobStatus(jobId, 'cancelled', null)
    this.store.cancelQueued(jobId)
    this.waiting = this.waiting.filter((id) => id !== jobId)
    if (this.running === jobId) this.sleepAbort?.abort()
    this.emit({ type: 'cancelled', jobId })
  }

  /** Requeues only the failed rows and runs the job again. */
  retryFailed(jobId: number): number {
    const count = this.store.requeueFailed(jobId)
    if (count > 0) this.start(jobId)
    return count
  }

  /** Resolves when the queue is idle (for tests and shutdown). */
  async idle(): Promise<void> {
    while (this.loop) await this.loop
  }

  private kick(): void {
    if (this.loop) return
    this.loop = this.run()
      // Errors here only happen when the app shuts down mid-send (database closed);
      // the row stays "sending" and is verified on the next start.
      .catch(() => undefined)
      .finally(() => {
        this.loop = null
        if (this.waiting.length) this.kick()
      })
  }

  private async run(): Promise<void> {
    while (this.waiting.length) {
      const jobId = this.waiting.shift()!
      this.running = jobId
      try {
        await this.runJob(jobId)
      } finally {
        this.running = null
      }
    }
  }

  private async runJob(jobId: number): Promise<void> {
    let first = true
    while (this.store.jobStatus(jobId) === 'running') {
      const sendId = this.store.nextQueued(jobId)
      if (sendId === null) {
        this.store.setJobStatus(jobId, 'completed', null)
        this.emit({ type: 'completed', jobId })
        return
      }
      if (!first) {
        const delay = this.options.intervalMs()
        this.emit({ type: 'progress', jobId, nextAt: this.options.now() + delay })
        this.sleepAbort = new AbortController()
        try {
          await this.options.sleep(delay, this.sleepAbort.signal)
        } catch {
          // Woken up by pause/cancel; the loop condition decides what happens next.
        } finally {
          this.sleepAbort = null
        }
        if (this.store.jobStatus(jobId) !== 'running') return
      }
      first = false
      const outcome = await this.deliver(sendId)
      if (
        outcome.status === 'queued' &&
        outcome.errorCode &&
        this.options.pauseOn.has(outcome.errorCode)
      ) {
        this.pause(jobId, outcome.errorCode)
        return
      }
      this.emit({ type: 'progress', jobId, nextAt: null })
    }
  }
}
