import { type ReactNode, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FlaskConical, Info, LogOut, RefreshCw } from 'lucide-react'
import type { MailProviderKind, SmtpSettings } from '@shared/schemas/settings'
import { useAccount } from '@renderer/stores/account'
import { useSettings } from '@renderer/stores/settings'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { confirm } from '@renderer/components/Confirm'
import { Button, Field, Segmented, Switch } from '@renderer/components/ui'
import { ClientIdForm, ClientIdSummary } from './ClientIdForm'

function MicrosoftAccount(): ReactNode {
  const { status, connecting, login, logout } = useAccount()
  const [editingId, setEditingId] = useState(false)
  if (!status) return null
  if (!status.configured) {
    return (
      <div className="connect-box">
        <div className="callout callout-warning" style={{ alignSelf: 'stretch' }}>
          <AlertTriangle size={16} />
          <span>{t('account.clientIdNeeded')}</span>
        </div>
        <ClientIdForm />
      </div>
    )
  }
  const idEditor = editingId ? (
    <ClientIdForm compact />
  ) : (
    <ClientIdSummary onChange={() => setEditingId(true)} />
  )
  if (!status.account) {
    return (
      <div className="connect-box">
        {idEditor}
        <p className="muted">{t('account.connectHint')}</p>
        <Button
          variant="primary"
          size="lg"
          loading={connecting}
          onClick={() => void login()}
          data-testid="connect-outlook"
        >
          {t('account.connectOutlook')}
        </Button>
        {connecting && <p className="subtle">{t('account.connectingHint')}</p>}
      </div>
    )
  }
  const email = status.account.email
  return (
    <div className="stack">
      <div className="group">
        <div className="group-row">
          <CheckCircle2 size={18} className="text-success" />
          <div className="group-row-label">
            <div>{status.account.name}</div>
            <div className="subtle">{t('account.connected', { email })}</div>
          </div>
          <Button icon={<RefreshCw size={14} />} loading={connecting} onClick={() => void login()}>
            {t('account.switchAccount')}
          </Button>
          <Button
            variant="danger-ghost"
            icon={<LogOut size={14} />}
            onClick={async () => {
              const ok = await confirm({
                title: t('account.disconnectTitle', { email }),
                description: t('account.disconnectText'),
                confirmLabel: t('account.disconnect'),
                destructive: true,
              })
              if (ok) await logout()
            }}
          >
            {t('account.disconnect')}
          </Button>
        </div>
      </div>
      {idEditor}
    </div>
  )
}

function SmtpForm(): ReactNode {
  const { settings, update } = useSettings()
  const status = useAccount((s) => s.status)
  const [form, setForm] = useState<SmtpSettings | null>(settings?.smtp ?? null)
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => setForm(settings?.smtp ?? null), [settings?.smtp])
  if (!form) return null

  const save = async (): Promise<void> => {
    await update({ smtp: form })
    if (password) {
      await call('account:setSmtpPassword', { password })
      setPassword('')
    }
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(settings?.smtp) || !!password

  const text = (key: keyof SmtpSettings, label: string, type = 'text') => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type={type}
          className="input"
          value={String(form[key])}
          onChange={(e) =>
            setForm({ ...form, [key]: type === 'number' ? Number(e.target.value) : e.target.value })
          }
        />
      )}
    </Field>
  )

  return (
    <div className="stack">
      <div className="callout">
        <Info size={16} />
        <span>{t('account.smtpHint')}</span>
      </div>
      <div className="group card-pad">
        <div className="form-grid">
          {text('host', t('account.smtpHost'))}
          {text('port', t('account.smtpPort'), 'number')}
          <div className="span-2 row-between">
            <div>
              <div className="field-label">{t('account.smtpSecure')}</div>
              <div className="field-hint">{t('account.smtpSecureHint')}</div>
            </div>
            <Switch
              checked={form.secure}
              onChange={(secure) => setForm({ ...form, secure })}
              label={t('account.smtpSecure')}
            />
          </div>
          {text('user', t('account.smtpUser'))}
          <Field label={t('account.smtpPassword')} hint={t('account.smtpPasswordHint')}>
            {(id) => (
              <input
                id={id}
                type="password"
                className="input"
                autoComplete="new-password"
                placeholder={
                  status?.hasSmtpPassword ? `•••••••• (${t('account.smtpPasswordSaved')})` : ''
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            )}
          </Field>
          {text('fromName', t('account.smtpFromName'))}
          {text('fromEmail', t('account.smtpFromEmail'), 'email')}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <Button
            loading={testing}
            disabled={dirty}
            onClick={async () => {
              setTesting(true)
              try {
                await call('account:testSmtp')
                toast.success(t('account.smtpOk'))
              } catch (error) {
                toast.error(error)
              } finally {
                setTesting(false)
              }
            }}
          >
            {t('account.smtpTest')}
          </Button>
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => void save().catch(toast.error)}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AccountSection(): ReactNode {
  const { settings, update } = useSettings()
  if (!settings) return null
  return (
    <section id="settings-account" className="stack">
      <h2 className="group-title">{t('account.title')}</h2>
      <div className="row-between">
        <span className="muted">{t('account.method')}</span>
        <Segmented<MailProviderKind>
          label={t('account.method')}
          value={settings.mailProvider}
          onChange={(mailProvider) => void update({ mailProvider })}
          options={[
            { value: 'graph', label: t('account.methodGraph') },
            { value: 'smtp', label: t('account.methodSmtp') },
            { value: 'mock', label: t('account.methodMock') },
          ]}
        />
      </div>
      {settings.mailProvider === 'graph' && <MicrosoftAccount />}
      {settings.mailProvider === 'smtp' && <SmtpForm />}
      {settings.mailProvider === 'mock' && (
        <div className="callout">
          <FlaskConical size={16} />
          <span>{t('account.methodMockHint')}</span>
        </div>
      )}
    </section>
  )
}
