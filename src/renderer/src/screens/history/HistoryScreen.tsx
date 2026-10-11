import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertTriangle, Download, History as HistoryIcon, Paperclip, Search, X } from 'lucide-react'
import { sendStatuses, type SendRecord, type SendStatus } from '@shared/schemas/send'
import { call, subscribe } from '@renderer/lib/api'
import { t, tp, type MessageKey } from '@renderer/lib/i18n'
import { formatDateTime } from '@renderer/lib/format'
import { cx } from '@renderer/lib/platform'
import { useQueue } from '@renderer/stores/queue'
import { useTemplates } from '@renderer/stores/templates'
import { toast } from '@renderer/stores/toast'
import { Button, EmptyState, SkeletonRows } from '@renderer/components/ui'
import { JobCard } from '@renderer/components/JobCard'
import { TitlebarActions } from '@renderer/components/TitlebarActions'
import { SendStatusBadge } from '../leads/LeadPanel'

function reasonText(r: SendRecord): string {
  if (!r.errorCode) return ''
  const key = (
    r.errorCode.startsWith('skip') ? `skipReason.${r.errorCode}` : `errors.${r.errorCode}`
  ) as MessageKey
  return t(key)
}

function Detail({ id, onClose }: { id: number; onClose(): void }): ReactNode {
  const [row, setRow] = useState<(SendRecord & { bodyHtml: string }) | null>(null)
  useEffect(() => {
    call('history:get', { id }).then(setRow).catch(toast.error)
  }, [id])
  const resolve = async (action: 'markSent' | 'retry'): Promise<void> => {
    try {
      await call('history:resolveUnknown', { id, action })
      onClose()
    } catch (error) {
      toast.error(error)
    }
  }
  return (
    <motion.aside
      className="drawer"
      aria-label={t('history.details')}
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="drawer-header drag">
        <strong className="grow truncate">{t('history.details')}</strong>
        {row && <SendStatusBadge status={row.status} />}
        <Button
          size="sm"
          variant="ghost"
          icon={<X size={16} />}
          aria-label={t('common.close')}
          onClick={onClose}
        />
      </div>
      <div className="drawer-body">
        {!row ? (
          <SkeletonRows rows={6} />
        ) : (
          <div className="stack">
            {row.status === 'unknown' && (
              <div className="callout callout-warning">
                <AlertTriangle size={16} />
                <div className="stack" style={{ gap: 8 }}>
                  <span>{t('history.unknownHint')}</span>
                  <div className="row">
                    <Button size="sm" onClick={() => void resolve('markSent')}>
                      {t('history.markSent')}
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => void resolve('retry')}>
                      {t('history.retryUnknown')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {reasonText(row) && <div className="callout callout-danger">{reasonText(row)}</div>}
            <dl className="kv selectable">
              <div>
                <dt>{t('history.colDate')}</dt>
                <dd>{formatDateTime(row.sentAt ?? row.createdAt)}</dd>
              </div>
              <div>
                <dt>{t('history.colRecipient')}</dt>
                <dd>
                  {row.toName} &lt;{row.toEmail}&gt;
                </dd>
              </div>
              <div>
                <dt>{t('history.colTemplate')}</dt>
                <dd>{row.templateName || '—'}</dd>
              </div>
              <div>
                <dt>{t('history.colSubject')}</dt>
                <dd>{row.subject || '—'}</dd>
              </div>
              <div>
                <dt>{t('history.colAttachments')}</dt>
                <dd>{row.attachments.map((a) => a.name).join(', ') || '—'}</dd>
              </div>
            </dl>
            {row.bodyHtml && (
              <iframe
                title={t('templates.preview')}
                className="history-frame"
                sandbox=""
                srcDoc={row.bodyHtml}
              />
            )}
          </div>
        )}
      </div>
    </motion.aside>
  )
}

const ROW = 44

export function HistoryScreen(): ReactNode {
  const { jobs, load: loadJobs } = useQueue()
  const { templates, load: loadTemplates } = useTemplates()
  const [rows, setRows] = useState<SendRecord[] | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SendStatus | null>(null)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const parent = useRef<HTMLDivElement>(null)

  const query = useCallback(
    () => call('history:query', { search, status, templateId }).then(setRows).catch(toast.error),
    [search, status, templateId],
  )

  useEffect(() => {
    void loadJobs()
    void loadTemplates()
  }, [loadJobs, loadTemplates])

  useEffect(() => {
    const id = setTimeout(() => void query(), 180)
    return () => clearTimeout(id)
  }, [query])

  useEffect(
    () =>
      subscribe('data:changed', ({ scope }) => {
        if (scope.includes('sends')) void query()
      }),
    [query],
  )

  const virtualizer = useVirtualizer({
    count: rows?.length ?? 0,
    getScrollElement: () => parent.current,
    estimateSize: () => ROW,
    overscan: 10,
  })

  const exportCsv = async (): Promise<void> => {
    try {
      const path = await call('history:exportCsv', { search, status, templateId })
      if (path) toast.success(t('history.exported'), path)
    } catch (error) {
      toast.error(error)
    }
  }

  const visibleJobs = jobs.filter(
    (j) =>
      j.status === 'running' ||
      j.status === 'paused' ||
      Date.now() - Date.parse(j.createdAt) < 86_400_000,
  )
  const filtering = !!search || status !== null || templateId !== null

  return (
    <div className="screen-fill">
      <TitlebarActions>
        <Button
          size="sm"
          variant="ghost"
          icon={<Download size={14} />}
          onClick={() => void exportCsv()}
        >
          {t('history.export')}
        </Button>
      </TitlebarActions>

      {visibleJobs.length > 0 && (
        <div className="jobs">
          {visibleJobs.slice(0, 3).map((j) => (
            <JobCard key={j.jobId} job={j} />
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className="input-with-icon toolbar-search">
          <Search size={14} />
          <input
            className="input"
            type="search"
            data-search
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          aria-label={t('history.colStatus')}
          value={status ?? ''}
          onChange={(e) => setStatus((e.target.value || null) as SendStatus | null)}
        >
          <option value="">{t('history.allStatuses')}</option>
          {sendStatuses.map((s) => (
            <option key={s} value={s}>
              {t(`sendStatus.${s}`)}
            </option>
          ))}
        </select>
        <select
          className="select"
          aria-label={t('history.colTemplate')}
          value={templateId ?? ''}
          onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{t('history.allTemplates')}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <div className="grow" />
        {rows && <span className="subtle tabular">{tp('history.count', rows.length)}</span>}
      </div>

      <div className="table-card">
        {!rows ? (
          <div style={{ padding: 16 }}>
            <SkeletonRows rows={8} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={filtering ? <Search size={26} /> : <HistoryIcon size={26} />}
            title={filtering ? t('history.noResults') : t('history.emptyTitle')}
            description={filtering ? undefined : t('history.emptyText')}
          />
        ) : (
          <div className="table history-table" role="grid" aria-rowcount={rows.length}>
            <div className="table-head" role="row">
              <div className="cell" role="columnheader">
                {t('history.colDate')}
              </div>
              <div className="cell" role="columnheader">
                {t('history.colRecipient')}
              </div>
              <div className="cell" role="columnheader">
                {t('history.colSubject')}
              </div>
              <div className="cell" role="columnheader">
                {t('history.colTemplate')}
              </div>
              <div className="cell" role="columnheader">
                {t('history.colStatus')}
              </div>
            </div>
            <div className="table-body" ref={parent} tabIndex={0}>
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((v) => {
                  const r = rows[v.index]!
                  return (
                    <div
                      key={r.id}
                      role="row"
                      className={cx('table-row', openId === r.id && 'is-open')}
                      style={{ transform: `translateY(${v.start}px)`, height: ROW }}
                      onClick={() => setOpenId(r.id)}
                    >
                      <div className="cell subtle tabular truncate">
                        {formatDateTime(r.sentAt ?? r.createdAt)}
                      </div>
                      <div className="cell history-recipient">
                        <span className="truncate">{r.toName || r.toEmail}</span>
                        <span className="subtle truncate">{r.toEmail}</span>
                      </div>
                      <div className="cell truncate">
                        {r.attachments.length > 0 && <Paperclip size={12} className="muted" />}{' '}
                        {r.subject || '—'}
                      </div>
                      <div className="cell truncate muted">{r.templateName}</div>
                      <div className="cell" title={reasonText(r)}>
                        <SendStatusBadge status={r.status} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>
        {openId !== null && <Detail key={openId} id={openId} onClose={() => setOpenId(null)} />}
      </AnimatePresence>
    </div>
  )
}
