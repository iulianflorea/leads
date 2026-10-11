import { type ReactNode, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Pause, Play, RotateCcw, X } from 'lucide-react'
import type { JobProgress } from '@shared/schemas/send'
import { useQueue } from '@renderer/stores/queue'
import { useAccount } from '@renderer/stores/account'
import { toast } from '@renderer/stores/toast'
import { t, tp } from '@renderer/lib/i18n'
import { formatDateTime } from '@renderer/lib/format'
import { confirm } from './Confirm'
import { Badge, Button } from './ui'

function useCountdown(iso: string | null): number | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!iso) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [iso])
  if (!iso) return null
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000))
}

export function JobCard({ job }: { job: JobProgress }): ReactNode {
  const { act, retryFailed } = useQueue()
  const login = useAccount((s) => s.login)
  const countdown = useCountdown(job.status === 'running' ? job.nextAt : null)
  const done = job.sent + job.failed + job.skipped
  const pct = job.total ? Math.round((done / job.total) * 100) : 0
  const reason =
    job.status !== 'paused' || !job.pausedReason
      ? null
      : job.pausedReason === 'interrupted'
        ? t('queue.interrupted')
        : job.pausedReason === 'authExpired' || job.pausedReason === 'authRequired'
          ? t('queue.pausedAuth')
          : t('queue.pausedAccount')

  return (
    <motion.div layout className="job-card" data-testid="job-card">
      <div className="row-between">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <strong className="truncate">{job.templateName || '—'}</strong>
            <Badge
              tone={
                job.status === 'running'
                  ? 'accent'
                  : job.status === 'completed'
                    ? 'success'
                    : job.status === 'paused'
                      ? 'warning'
                      : undefined
              }
            >
              {t(`queue.${job.status}`)}
            </Badge>
          </div>
          <div className="subtle">{formatDateTime(job.createdAt)}</div>
        </div>
        <div className="row">
          {job.status === 'running' && (
            <Button
              size="sm"
              icon={<Pause size={13} />}
              onClick={() => void act('pause', job.jobId)}
            >
              {t('queue.pause')}
            </Button>
          )}
          {job.status === 'paused' && (
            <Button
              size="sm"
              variant="primary"
              icon={<Play size={13} />}
              onClick={async () => {
                if (job.pausedReason === 'authExpired' || job.pausedReason === 'authRequired') {
                  if (!(await login())) return
                }
                await act('resume', job.jobId)
              }}
              data-testid="job-resume"
            >
              {t('queue.resume')}
            </Button>
          )}
          {(job.status === 'completed' || job.status === 'cancelled') && job.failed > 0 && (
            <Button
              size="sm"
              icon={<RotateCcw size={13} />}
              onClick={async () => {
                const n = await retryFailed(job.jobId)
                if (n) toast.info(tp('queue.retried', n))
              }}
            >
              {t('queue.retryFailed')}
            </Button>
          )}
          {(job.status === 'running' || job.status === 'paused') && (
            <Button
              size="sm"
              variant="danger-ghost"
              icon={<X size={13} />}
              onClick={async () => {
                const ok = await confirm({
                  title: t('queue.cancelTitle'),
                  description: t('queue.cancelText'),
                  confirmLabel: t('queue.cancel'),
                  destructive: true,
                })
                if (ok) await act('cancel', job.jobId)
              }}
            >
              {t('queue.cancel')}
            </Button>
          )}
        </div>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={job.total}
        aria-valuenow={done}
        aria-label={t('queue.progress', { done, total: job.total })}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="row-between subtle tabular">
        <span>
          {t('queue.progress', { done, total: job.total })} ·{' '}
          {t('queue.counts', { sent: job.sent, failed: job.failed, skipped: job.skipped })}
        </span>
        {countdown !== null && countdown > 0 && (
          <span>{t('queue.next', { seconds: countdown })}</span>
        )}
        {job.status === 'completed' && job.failed === 0 && (
          <CheckCircle2 size={15} className="text-success" />
        )}
      </div>
      {job.unknown > 0 && (
        <div className="callout callout-warning">
          <AlertTriangle size={15} />
          <span>{tp('queue.unknownRows', job.unknown)}</span>
        </div>
      )}
      {reason && (
        <div className="callout callout-warning">
          <AlertTriangle size={15} />
          <span>{reason}</span>
        </div>
      )}
    </motion.div>
  )
}
