import type { JobProgress, JobStatus } from '@shared/schemas/send'
import type { DB } from '../db/connection'
import type { QueueStore } from './send-queue'

interface RawJob {
  id: number
  template_name: string
  status: JobStatus
  paused_reason: string | null
  created_at: string
}

export class SqliteQueueStore implements QueueStore {
  constructor(private readonly db: DB) {}

  jobStatus(jobId: number): JobStatus | null {
    return (
      (this.db.prepare('SELECT status FROM send_jobs WHERE id = ?').pluck().get(jobId) as
        JobStatus | undefined) ?? null
    )
  }

  setJobStatus(jobId: number, status: JobStatus, pausedReason: string | null = null): void {
    this.db
      .prepare('UPDATE send_jobs SET status = ?, paused_reason = ?, updated_at = ? WHERE id = ?')
      .run(status, pausedReason, new Date().toISOString(), jobId)
  }

  nextQueued(jobId: number): number | null {
    return (
      (this.db
        .prepare("SELECT id FROM sends WHERE job_id = ? AND status = 'queued' ORDER BY id LIMIT 1")
        .pluck()
        .get(jobId) as number | undefined) ?? null
    )
  }

  cancelQueued(jobId: number): void {
    this.db
      .prepare(
        "UPDATE sends SET status = 'cancelled', updated_at = ? WHERE job_id = ? AND status = 'queued'",
      )
      .run(new Date().toISOString(), jobId)
  }

  requeueFailed(jobId: number): number {
    return this.db
      .prepare(
        "UPDATE sends SET status = 'queued', error_code = NULL, error_detail = NULL, updated_at = ? WHERE job_id = ? AND status = 'failed'",
      )
      .run(new Date().toISOString(), jobId).changes
  }

  progress(jobId: number, nextAt: string | null = null): JobProgress | null {
    const job = this.db.prepare('SELECT * FROM send_jobs WHERE id = ?').get(jobId) as
      RawJob | undefined
    if (!job) return null
    const counts = Object.fromEntries(
      (
        this.db
          .prepare('SELECT status, COUNT(*) AS n FROM sends WHERE job_id = ? GROUP BY status')
          .all(jobId) as Array<{
          status: string
          n: number
        }>
      ).map((r) => [r.status, r.n]),
    ) as Record<string, number | undefined>
    const n = (s: string): number => counts[s] ?? 0
    return {
      jobId,
      templateName: job.template_name,
      status: job.status,
      total: Object.values(counts).reduce<number>((a, b) => a + (b ?? 0), 0),
      sent: n('sent'),
      failed: n('failed'),
      skipped: n('skipped') + n('cancelled'),
      queued: n('queued') + n('sending'),
      unknown: n('unknown'),
      pausedReason: job.paused_reason,
      createdAt: job.created_at,
      nextAt,
    }
  }

  /** Bulk jobs that still need attention, plus the most recent finished ones. */
  recentJobs(limit = 5): number[] {
    return this.db
      .prepare(
        `SELECT id FROM send_jobs WHERE kind = 'bulk'
         ORDER BY CASE WHEN status IN ('running', 'paused') THEN 0 ELSE 1 END, id DESC LIMIT ?`,
      )
      .pluck()
      .all(limit) as number[]
  }

  /** Rows left in "sending" by a crash: the email may or may not have gone out. */
  inFlight(): Array<{ id: number; created_at: string }> {
    return this.db
      .prepare("SELECT id, created_at FROM sends WHERE status = 'sending'")
      .all() as Array<{
      id: number
      created_at: string
    }>
  }

  runningJobs(): number[] {
    return this.db
      .prepare("SELECT id FROM send_jobs WHERE status = 'running'")
      .pluck()
      .all() as number[]
  }
}
