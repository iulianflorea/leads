import { type ReactNode, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Ban, FileCheck2, FileQuestion, FileX2, Send, X } from 'lucide-react'
import { leadStatuses, type LeadDetail, type LeadStatus } from '@shared/schemas/lead'
import { call, subscribe } from '@renderer/lib/api'
import { useLeads } from '@renderer/stores/leads'
import { toast } from '@renderer/stores/toast'
import { t } from '@renderer/lib/i18n'
import { Badge, Button, SkeletonRows } from '@renderer/components/ui'
import { LeadForm, leadFormErrors, type LeadFormValue } from './LeadForm'
import { StatusBadge } from './badges'
import type { SendRecord } from '@shared/schemas/send'
import { useSendDialog } from '../send/SendDialog'
import { formatDateTime } from '@renderer/lib/format'
import type { MessageKey } from '@renderer/lib/i18n'

function toForm(d: LeadDetail): LeadFormValue {
  return {
    listId: d.listId,
    name: d.name,
    firstName: d.firstName,
    email: d.email,
    phone: d.phone,
    address: d.address,
    productRaw: d.productRaw,
  }
}

function SendHistory({ items }: { items: SendRecord[] }): ReactNode {
  if (items.length === 0) return <p className="subtle">{t('leads.historyEmpty')}</p>
  return (
    <ul className="history-list">
      {items.map((h) => (
        <li key={h.id}>
          <div className="row-between">
            <strong className="truncate">{h.subject}</strong>
            <SendStatusBadge status={h.status} />
          </div>
          <div className="subtle">
            {formatDateTime(h.sentAt ?? h.createdAt)} · {h.templateName || '—'}
            {h.attachments.length > 0 && ` · ${h.attachments.map((a) => a.name).join(', ')}`}
          </div>
          {h.status === 'failed' && h.errorCode && (
            <div className="subtle text-danger">{t(`errors.${h.errorCode}` as MessageKey)}</div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function SendStatusBadge({ status }: { status: SendRecord['status'] }): ReactNode {
  const tone =
    status === 'sent'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'unknown'
          ? 'warning'
          : 'accent'
  return <Badge tone={tone}>{t(`sendStatus.${status}` as MessageKey)}</Badge>
}

export function LeadPanel({ id }: { id: number }): ReactNode {
  const close = (): void => useLeads.getState().open(null)
  const [lead, setLead] = useState<LeadDetail | null>(null)
  const [form, setForm] = useState<LeadFormValue | null>(null)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<SendRecord[]>([])
  const openSend = useSendDialog((s) => s.open)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      call('leads:get', { id })
        .then((d) => {
          if (cancelled) return
          setLead(d)
          setForm(toForm(d))
        })
        .then(() => call('leads:history', { id }))
        .then((h) => !cancelled && h && setHistory(h))
        .catch((error: unknown) => {
          if (!cancelled) {
            toast.error(error)
            close()
          }
        })
    }
    load()
    const off = subscribe('data:changed', ({ scope }) => {
      if (scope.includes('products') || scope.includes('sends')) load()
    })
    return () => {
      cancelled = true
      off()
    }
  }, [id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !document.querySelector('.overlay')) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const dirty = !!lead && !!form && JSON.stringify(toForm(lead)) !== JSON.stringify(form)
  const valid = !!form && Object.keys(leadFormErrors(form)).length === 0

  const save = async (): Promise<void> => {
    if (!form || !lead) return
    setSaving(true)
    try {
      const updated = await call('leads:update', { id: lead.id, patch: form })
      setLead(updated)
      setForm(toForm(updated))
      toast.success(t('leads.savedLead'))
    } catch (error) {
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  const setStatus = async (status: LeadStatus): Promise<void> => {
    if (!lead) return
    try {
      await call('leads:setStatus', { ids: [lead.id], status })
      setLead({ ...lead, status })
    } catch (error) {
      toast.error(error)
    }
  }

  return (
    <motion.aside
      ref={ref}
      className="drawer"
      aria-label={t('leads.details')}
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="drawer-header drag">
        <strong className="grow truncate">{lead?.name || lead?.email || t('leads.details')}</strong>
        {lead && <StatusBadge status={lead.status} />}
        <Button
          size="sm"
          variant="ghost"
          icon={<X size={16} />}
          aria-label={t('common.close')}
          onClick={close}
        />
      </div>
      <div className="drawer-body">
        {!lead || !form ? (
          <SkeletonRows rows={8} />
        ) : (
          <div className="stack" style={{ gap: 20 }}>
            <Button
              variant="primary"
              icon={<Send size={14} />}
              disabled={!lead.emailValid}
              onClick={() => openSend(lead.id)}
              data-testid="lead-send"
            >
              {t('send.sendEmail')}
            </Button>

            <LeadForm value={form} onChange={setForm} />
            {dirty && (
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <Button onClick={() => setForm(toForm(lead))}>{t('common.cancel')}</Button>
                <Button
                  variant="primary"
                  loading={saving}
                  disabled={!valid}
                  onClick={() => void save()}
                >
                  {t('common.save')}
                </Button>
              </div>
            )}

            <div className="field">
              <label className="field-label" htmlFor="lead-status">
                {t('fields.status')}
              </label>
              <select
                id="lead-status"
                className="select"
                value={lead.status}
                onChange={(e) => void setStatus(e.target.value as LeadStatus)}
              >
                {leadStatuses.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
              {lead.status === 'do_not_contact' && (
                <span className="field-hint row">
                  <Ban size={12} /> {t('settings.dncHint')}
                </span>
              )}
            </div>

            <section>
              <h3 className="panel-title">{t('leads.productsTitle')}</h3>
              {lead.products.length === 0 ? (
                <p className="subtle">{t('leads.noProducts')}</p>
              ) : (
                <ul className="product-values">
                  {lead.products.map((p) => (
                    <li key={p.value}>
                      {p.hasPdf ? (
                        <FileCheck2 size={15} className="text-success" />
                      ) : p.ignored ? (
                        <FileX2 size={15} className="muted" />
                      ) : (
                        <FileQuestion size={15} className="text-warning" />
                      )}
                      <span className="grow truncate">
                        {p.value}
                        {p.productName && p.productName !== p.value && (
                          <span className="subtle"> → {p.productName}</span>
                        )}
                      </span>
                      {!p.productId && !p.ignored && (
                        <Badge tone="warning">{t('leads.productUnmatched')}</Badge>
                      )}
                      {p.productId && !p.hasPdf && (
                        <Badge tone="warning">{t('leads.productNoPdf')}</Badge>
                      )}
                      {p.ignored && <Badge>{t('leads.productIgnored')}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="panel-title">{t('leads.historyTitle')}</h3>
              <SendHistory items={history} />
            </section>

            {Object.keys(lead.extra).length > 0 && (
              <section>
                <h3 className="panel-title">{t('leads.extraTitle')}</h3>
                <dl className="kv selectable">
                  {Object.entries(lead.extra).map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  )
}
