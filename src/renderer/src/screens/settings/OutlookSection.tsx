import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Info, MonitorSmartphone, RefreshCw, ShieldAlert } from 'lucide-react'
import type { OutlookAccount } from '@shared/schemas/mail'
import { useSettings } from '@renderer/stores/settings'
import { useAccount } from '@renderer/stores/account'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { platform } from '@renderer/lib/platform'
import { t, tp } from '@renderer/lib/i18n'
import { Button } from '@renderer/components/ui'

/** Settings for sending through classic Outlook installed on Windows. */
export function OutlookSection(): ReactNode {
  const { settings, update } = useSettings()
  const [accounts, setAccounts] = useState<OutlookAccount[] | null>(null)
  const [checking, setChecking] = useState(false)

  const detect = useCallback(async (announce: boolean) => {
    setChecking(true)
    try {
      const list = await call('account:outlookAccounts')
      setAccounts(list)
      await useAccount.getState().load()
      if (announce) {
        if (list.length) toast.success(tp('account.outlookDetected', list.length))
        else toast.warning(t('account.outlookNoAccounts'))
      }
    } catch (error) {
      setAccounts(null)
      toast.error(error)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    if (platform === 'win32') void detect(false)
  }, [detect])

  if (platform !== 'win32') {
    return (
      <div className="callout callout-warning">
        <Info size={16} />
        <span>{t('account.outlookNotWindows')}</span>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="callout">
        <MonitorSmartphone size={16} />
        <div className="stack" style={{ gap: 4 }}>
          <span>{t('account.outlookIntro')}</span>
          <span className="subtle">{t('account.outlookRequirements')}</span>
        </div>
      </div>
      <div className="group">
        <div className="group-row">
          {accounts && accounts.length > 0 ? (
            <CheckCircle2 size={18} className="text-success" />
          ) : (
            <Info size={18} className="muted" />
          )}
          <div className="group-row-label">
            <div>{t('account.outlookAccount')}</div>
            <div className="subtle">{t('account.outlookAccountHint')}</div>
          </div>
          <select
            className="select"
            aria-label={t('account.outlookAccount')}
            value={settings?.outlookAccount ?? ''}
            disabled={!accounts?.length}
            onChange={(e) => void update({ outlookAccount: e.target.value })}
          >
            <option value="">{t('account.outlookDefault')}</option>
            {accounts?.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name && a.name !== a.email ? `${a.name} <${a.email}>` : a.email}
              </option>
            ))}
          </select>
          <Button
            icon={<RefreshCw size={14} />}
            loading={checking}
            onClick={() => void detect(true)}
          >
            {t('account.outlookDetect')}
          </Button>
        </div>
      </div>
      <div className="callout callout-warning">
        <ShieldAlert size={16} />
        <div className="stack" style={{ gap: 4 }}>
          <span>{t('account.outlookPrompt')}</span>
          <span className="subtle">{t('account.outlookOutbox')}</span>
        </div>
      </div>
    </div>
  )
}
