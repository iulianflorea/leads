import { type ReactNode, useEffect, useState } from 'react'
import { create } from 'zustand'
import { AlertTriangle, Info, Send } from 'lucide-react'
import type { BulkSummary } from '@shared/schemas/send'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { useTemplates } from '@renderer/stores/templates'
import { useSettings } from '@renderer/stores/settings'
import { useAccount } from '@renderer/stores/account'
import { useNav } from '@renderer/stores/nav'
import { useQueue } from '@renderer/stores/queue'
import { toast } from '@renderer/stores/toast'
import { Modal } from '@renderer/components/Modal'
import { Button, Skeleton, Switch } from '@renderer/components/ui'

type Target = { leadIds: number[] } | { listId: number }

export const useBulkDialog = create<{
  target: Target | null
  open(target: Target): void
  close(): void
}>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
}))

function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone?: 'success' | 'warning'
}): ReactNode {
  return (
    <div className="stat">
      <div
        className="stat-value"
        style={tone && value > 0 ? { color: `var(--${tone})` } : undefined}
      >
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

export function BulkSendDialogHost(): ReactNode {
  const { target, close } = useBulkDialog()
  const { templates, loaded, load } = useTemplates()
  const settings = useSettings((s) => s.settings)
  const status = useAccount((s) => s.status)
  const go = useNav((s) => s.go)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [skipAlreadySent, setSkipAlreadySent] = useState(true)
  const [includeWithoutPdf, setIncludeWithoutPdf] = useState(true)
  const [summary, setSummary] = useState<BulkSummary | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!target) return
    if (!loaded) void load()
    setConfirmed(false)
    setSummary(null)
  }, [target, loaded, load])

  useEffect(() => {
    if (!target) return
    const def = templates.find((x) => x.isDefault) ?? templates[0]
    setTemplateId((c) => (c && templates.some((x) => x.id === c) ? c : (def?.id ?? null)))
  }, [target, templates])

  useEffect(() => {
    if (!target || templateId === null) return
    let cancelled = false
    call('send:prepareBulk', { target, templateId })
      .then((s) => !cancelled && setSummary(s))
      .catch(toast.error)
    return () => {
      cancelled = true
    }
  }, [target, templateId])

  useEffect(() => setConfirmed(false), [templateId, skipAlreadySent, includeWithoutPdf])

  if (!target) return null

  const interval = settings?.sendIntervalSeconds ?? 2
  const willSend = summary
    ? summary.ready -
      (includeWithoutPdf ? 0 : summary.withoutPdf) +
      (skipAlreadySent ? 0 : summary.alreadySent)
    : 0
  const hasAccount = !!status?.account

  const start = async (): Promise<void> => {
    if (templateId === null) return
    setStarting(true)
    try {
      await call('send:startBulk', { target, templateId, skipAlreadySent, includeWithoutPdf })
      await useQueue.getState().load()
      toast.success(t('bulk.started'))
      close()
      go('history')
    } catch (error) {
      toast.error(error)
    } finally {
      setStarting(false)
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title={t('bulk.title')}
      description={t('bulk.intro')}
      size="lg"
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            icon={<Send size={14} />}
            disabled={!confirmed || willSend === 0 || !hasAccount}
            loading={starting}
            onClick={() => void start()}
            data-testid="bulk-start"
          >
            {willSend > 0 ? tp('bulk.start', willSend) : t('send.send')}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 16 }}>
        <div className="row">
          <label className="field-label" htmlFor="bulk-template">
            {t('bulk.template')}
          </label>
          <select
            id="bulk-template"
            className="select grow"
            value={templateId ?? ''}
            onChange={(e) => setTemplateId(Number(e.target.value))}
            data-autofocus
          >
            {templates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>

        {templates.length === 0 && loaded && (
          <div className="callout callout-warning">
            <AlertTriangle size={16} />
            <span>{t('send.noTemplates')}</span>
          </div>
        )}

        {!summary ? (
          <Skeleton height={86} />
        ) : (
          <div className="stats" data-testid="bulk-summary">
            <Stat value={willSend} label={t('bulk.statReady')} tone="success" />
            <Stat value={summary.invalidEmail} label={t('bulk.statInvalid')} tone="warning" />
            <Stat value={summary.doNotContact} label={t('bulk.statDnc')} tone="warning" />
            <Stat value={summary.alreadySent} label={t('bulk.statAlreadySent')} tone="warning" />
            <Stat value={summary.withoutPdf} label={t('bulk.statWithoutPdf')} tone="warning" />
            {summary.duplicates > 0 && (
              <Stat value={summary.duplicates} label={t('bulk.statDuplicates')} tone="warning" />
            )}
          </div>
        )}

        <div className="group">
          <div className="group-row">
            <div className="group-row-label">{t('bulk.skipAlreadySent')}</div>
            <Switch
              checked={skipAlreadySent}
              onChange={setSkipAlreadySent}
              label={t('bulk.skipAlreadySent')}
            />
          </div>
          <div className="group-row">
            <div className="group-row-label">{t('bulk.includeWithoutPdf')}</div>
            <Switch
              checked={includeWithoutPdf}
              onChange={setIncludeWithoutPdf}
              label={t('bulk.includeWithoutPdf')}
            />
          </div>
        </div>

        {summary && willSend > 0 && (
          <p className="muted">
            {t('bulk.estimate', {
              duration: duration(Math.max(0, willSend - 1) * interval),
              seconds: String(interval).replace('.', ','),
            })}
          </p>
        )}

        <div className="callout">
          <Info size={16} />
          <div>
            <strong>{t('bulk.limitsTitle')}.</strong> {t('bulk.limitsText')}
            {willSend > 250 && (
              <div className="text-warning" style={{ marginTop: 4 }}>
                {t('bulk.largeWarning')}
              </div>
            )}
          </div>
        </div>

        {!hasAccount && (
          <div className="callout callout-warning">
            <AlertTriangle size={16} />
            <span>{t('send.needAccount')}</span>
          </div>
        )}

        {willSend === 0 && summary ? (
          <div className="callout callout-warning">
            <AlertTriangle size={16} />
            <span>{t('bulk.nothing')}</span>
          </div>
        ) : (
          <label className="confirm-check">
            <input
              type="checkbox"
              className="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              data-testid="bulk-confirm"
            />
            <span>{tp('bulk.confirm', willSend)}</span>
          </label>
        )}
      </div>
    </Modal>
  )
}
