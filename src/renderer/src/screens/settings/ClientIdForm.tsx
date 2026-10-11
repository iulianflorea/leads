import { type ReactNode, useState } from 'react'
import { ChevronDown, ChevronRight, Info, KeyRound } from 'lucide-react'
import { isValidClientId } from '@shared/config'
import { useSettings } from '@renderer/stores/settings'
import { useAccount } from '@renderer/stores/account'
import { toast } from '@renderer/stores/toast'
import { t } from '@renderer/lib/i18n'
import { Button } from '@renderer/components/ui'

const STEPS = [
  'account.clientIdSteps1',
  'account.clientIdSteps2',
  'account.clientIdSteps3',
  'account.clientIdSteps4',
  'account.clientIdSteps5',
] as const

function mask(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

/** Lets the user paste the Microsoft Entra Client ID; it is saved in the local database. */
export function ClientIdForm({ compact = false }: { compact?: boolean }): ReactNode {
  const { settings, update } = useSettings()
  const status = useAccount((s) => s.status)
  const [value, setValue] = useState(settings?.msClientId ?? '')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [howTo, setHowTo] = useState(!compact && !settings?.msClientId)
  const source = status?.clientIdSource

  if (source === 'env') {
    return (
      <div className="callout">
        <Info size={16} />
        <span>{t('account.clientIdEnv')}</span>
      </div>
    )
  }

  const trimmed = value.trim()
  const valid = isValidClientId(trimmed)
  const dirty = trimmed !== (settings?.msClientId ?? '')

  const save = async (next: string): Promise<void> => {
    setSaving(true)
    try {
      await update({ msClientId: next })
      await useAccount.getState().load()
      toast.success(next ? t('account.clientIdSaved') : t('account.clientIdRemoved'))
      setTouched(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="client-id-form">
      {source === 'build' && !settings?.msClientId && (
        <p className="subtle">{t('account.clientIdBuild')}</p>
      )}
      <label className="field-label" htmlFor="ms-client-id">
        {t('account.clientId')}
      </label>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && dirty) void save(trimmed)
        }}
      >
        <div className="input-with-icon grow">
          <KeyRound size={14} />
          <input
            id="ms-client-id"
            className="input mono"
            spellCheck={false}
            autoComplete="off"
            placeholder={t('account.clientIdPlaceholder')}
            value={value}
            aria-invalid={touched && trimmed !== '' && !valid ? true : undefined}
            aria-describedby="ms-client-id-hint"
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            data-testid="client-id-input"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!valid || !dirty}
          loading={saving}
          data-testid="client-id-save"
        >
          {t('common.save')}
        </Button>
        {settings?.msClientId && !dirty && (
          <Button variant="danger-ghost" onClick={() => void save('')}>
            {t('common.delete')}
          </Button>
        )}
      </form>
      <span
        id="ms-client-id-hint"
        className={touched && trimmed !== '' && !valid ? 'field-error' : 'field-hint'}
      >
        {touched && trimmed !== '' && !valid
          ? t('account.clientIdInvalid')
          : status?.account && dirty
            ? t('account.clientIdChangeWarning')
            : t('account.clientIdHint')}
      </span>
      <button
        type="button"
        className="link-btn"
        aria-expanded={howTo}
        onClick={() => setHowTo(!howTo)}
      >
        {howTo ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {t('account.clientIdHowTo')}
      </button>
      {howTo && (
        <ol className="howto selectable">
          {STEPS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Compact line shown once an ID is set: masked value + "change". */
export function ClientIdSummary({ onChange }: { onChange(): void }): ReactNode {
  const settings = useSettings((s) => s.settings)
  const status = useAccount((s) => s.status)
  if (!settings?.msClientId || status?.clientIdSource !== 'settings') return null
  return (
    <div className="row-between subtle">
      <span className="mono">
        {t('account.clientIdCurrent', { id: mask(settings.msClientId) })}
      </span>
      <button type="button" className="link-btn" onClick={onChange}>
        {t('account.clientIdChange')}
      </button>
    </div>
  )
}
