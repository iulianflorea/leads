import { type ReactNode, useEffect, useState } from 'react'
import { create } from 'zustand'
import { AlertTriangle, Ban, LogIn, Send } from 'lucide-react'
import type { EmailPreview as Preview } from '@shared/schemas/template'
import type { LeadSendChecks } from '@shared/schemas/send'
import { ApiError, call } from '@renderer/lib/api'
import { isErrorCode } from '@shared/errors'
import { t } from '@renderer/lib/i18n'
import { formatDateTime } from '@renderer/lib/format'
import { isModEvent, modKey } from '@renderer/lib/platform'
import { useTemplates } from '@renderer/stores/templates'
import { useAccount } from '@renderer/stores/account'
import { useNav } from '@renderer/stores/nav'
import { toast } from '@renderer/stores/toast'
import { Modal } from '@renderer/components/Modal'
import { EmailPreview } from '@renderer/components/EmailPreview'
import { confirm } from '@renderer/components/Confirm'
import { Button, Skeleton } from '@renderer/components/ui'

export const useSendDialog = create<{
  leadId: number | null
  open(leadId: number): void
  close(): void
}>((set) => ({
  leadId: null,
  open: (leadId) => set({ leadId }),
  close: () => set({ leadId: null }),
}))

/** Global host for the single-send dialog (opened from the lead panel, palette, etc.). */
export function SendDialogHost(): ReactNode {
  const { leadId, close } = useSendDialog()
  return <SendDialog leadId={leadId} onClose={close} />
}

export function SendDialog({
  leadId,
  onClose,
}: {
  leadId: number | null
  onClose(): void
}): ReactNode {
  const { templates, loaded, load } = useTemplates()
  const { status, login, connecting } = useAccount()
  const go = useNav((s) => s.go)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [checks, setChecks] = useState<LeadSendChecks | null>(null)
  const [sending, setSending] = useState(false)
  const open = leadId !== null

  useEffect(() => {
    if (open && !loaded) void load()
  }, [open, loaded, load])

  useEffect(() => {
    if (!open) return
    setPreview(null)
    setChecks(null)
    const def = templates.find((x) => x.isDefault) ?? templates[0]
    setTemplateId((current) =>
      current && templates.some((x) => x.id === current) ? current : (def?.id ?? null),
    )
  }, [open, templates])

  useEffect(() => {
    if (leadId === null || templateId === null) return
    let cancelled = false
    Promise.all([
      call('templates:preview', { source: { templateId }, leadId }),
      call('send:checks', { leadId, templateId }),
    ])
      .then(([p, c]) => {
        if (cancelled) return
        setPreview(p)
        setChecks(c)
      })
      .catch(toast.error)
    return () => {
      cancelled = true
    }
  }, [leadId, templateId])

  const hasAccount = !!status?.account
  const canSend = !!preview && preview.emailValid && hasAccount && templateId !== null && !sending

  const send = async (): Promise<void> => {
    if (!canSend || leadId === null || templateId === null || !preview) return
    if (checks?.previousSendAt || checks?.doNotContact) {
      const ok = await confirm({
        title: t('send.title'),
        description: checks.doNotContact
          ? t('send.doNotContact')
          : t('send.alreadySent', { date: formatDateTime(checks.previousSendAt) }),
        confirmLabel: t('send.send'),
        destructive: checks.doNotContact,
      })
      if (!ok) return
    }
    setSending(true)
    try {
      const outcome = await call('send:single', { leadId, templateId })
      if (outcome.status === 'sent') {
        toast.success(t('send.sent', { email: preview.to }))
        onClose()
      } else {
        toast.error(new ApiError(isErrorCode(outcome.errorCode) ? outcome.errorCode : 'unknown'))
      }
    } catch (error) {
      toast.error(error)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('send.title')}
      size="lg"
      footer={
        <>
          <span className="subtle grow">{t('send.shortcut', { key: modKey })}</span>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            icon={<Send size={14} />}
            disabled={!canSend}
            loading={sending}
            onClick={() => void send()}
            data-testid="send-confirm"
          >
            {t('send.send')}
          </Button>
        </>
      }
    >
      <div
        className="stack"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isModEvent(e)) {
            e.preventDefault()
            void send()
          }
        }}
      >
        {loaded && templates.length === 0 ? (
          <div className="callout callout-warning">
            <AlertTriangle size={16} />
            <div className="grow">{t('send.noTemplates')}</div>
            <Button
              size="sm"
              onClick={() => {
                onClose()
                go('templates')
              }}
            >
              {t('send.goTemplates')}
            </Button>
          </div>
        ) : (
          <div className="row">
            <label className="field-label" htmlFor="send-template">
              {t('send.template')}
            </label>
            <select
              id="send-template"
              className="select grow"
              value={templateId ?? ''}
              data-autofocus
              onChange={(e) => setTemplateId(Number(e.target.value))}
            >
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {!hasAccount && status && (
          <div className="callout callout-warning">
            <LogIn size={16} />
            <div className="grow">{t('send.needAccount')}</div>
            {status.provider === 'graph' && status.configured ? (
              <Button size="sm" variant="primary" loading={connecting} onClick={() => void login()}>
                {t('account.connectOutlook')}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  onClose()
                  go('settings', { section: 'account' })
                }}
              >
                {t('actions.openSettings')}
              </Button>
            )}
          </div>
        )}
        {checks?.doNotContact && (
          <div className="callout callout-danger">
            <Ban size={16} />
            <span>{t('send.doNotContact')}</span>
          </div>
        )}
        {checks?.previousSendAt && (
          <div className="callout callout-warning">
            <AlertTriangle size={16} />
            <span>{t('send.alreadySent', { date: formatDateTime(checks.previousSendAt) })}</span>
          </div>
        )}

        {preview ? (
          <EmailPreview preview={preview} dark={false} />
        ) : templates.length > 0 ? (
          <div className="stack">
            <Skeleton height={60} />
            <Skeleton height={200} />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
