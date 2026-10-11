import type { JobProgress } from '@shared/schemas/send'
import type { MailService } from '../mailer/service'
import type { SendService } from '../services/send'
import { ACCOUNT_ERRORS, sendStamp } from '../services/send'
import type { SettingsService } from '../services/settings'
import type { SendsRepo } from '../repos/sends'
import { logger } from '../logger'
import { SendQueue } from './send-queue'
import type { SqliteQueueStore } from './store'

/** Wires the queue to SQLite, the sender and the UI; handles crash recovery. */
export class QueueService {
  readonly queue: SendQueue
  private nextAt = new Map<number, string | null>()

  constructor(
    private readonly store: SqliteQueueStore,
    private readonly sends: SendsRepo,
    sender: SendService,
    private readonly mail: MailService,
    settings: SettingsService,
    private readonly emit: (progress: JobProgress) => void,
  ) {
    this.queue = new SendQueue(
      store,
      (id) => sender.deliver(id),
      {
        intervalMs: () => settings.get().sendIntervalSeconds * 1000,
        sleep: (ms, signal) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, ms)
            signal.addEventListener('abort', () => {
              clearTimeout(timer)
              reject(new Error('aborted'))
            })
          }),
        now: () => Date.now(),
        pauseOn: ACCOUNT_ERRORS,
      },
      (event) => {
        if (event.type === 'progress') {
          this.nextAt.set(event.jobId, event.nextAt ? new Date(event.nextAt).toISOString() : null)
        } else {
          this.nextAt.delete(event.jobId)
          logger.info(`[queue] job ${event.jobId} ${event.type}`)
        }
        const progress = this.progress(event.jobId)
        if (progress) this.emit(progress)
      },
    )
  }

  progress(jobId: number): JobProgress | null {
    return this.store.progress(jobId, this.nextAt.get(jobId) ?? null)
  }

  jobs(): JobProgress[] {
    return this.store
      .recentJobs()
      .map((id) => this.progress(id))
      .filter((p): p is JobProgress => !!p)
  }

  start(jobId: number): void {
    this.queue.start(jobId)
    const p = this.progress(jobId)
    if (p) this.emit(p)
  }

  /**
   * After a crash or forced quit: rows left "sending" are checked with the provider
   * (sent / not sent / unknown) and running jobs are paused until the user resumes them.
   * Returns the ids of interrupted jobs.
   */
  async recover(): Promise<number[]> {
    for (const row of this.store.inFlight()) {
      const verdict = await this.mail
        .provider()
        .wasSent?.(sendStamp(row.id, row.created_at))
        .catch(() => null)
      if (verdict === true) this.sends.markSent(row.id)
      else if (verdict === false) this.sends.setStatus(row.id, 'queued')
      else this.sends.setStatus(row.id, 'unknown')
      logger.info(`[queue] recovered in-flight send #${row.id}: ${String(verdict)}`)
    }
    const interrupted = this.store.runningJobs()
    for (const jobId of interrupted) this.store.setJobStatus(jobId, 'paused', 'interrupted')
    return interrupted
  }
}
