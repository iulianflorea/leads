import { type ReactNode, useEffect, useState } from 'react'
import { Archive, FileText, FolderOpen, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import type { Theme } from '@shared/schemas/settings'
import { languages } from '@shared/i18n'
import { useSettings } from '@renderer/stores/settings'
import { useNav } from '@renderer/stores/nav'
import { useOnboarding } from '@renderer/stores/onboarding'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { Button, Segmented, SkeletonRows, Switch } from '@renderer/components/ui'
import { RichEditor } from '@renderer/components/RichEditor'
import { confirm } from '@renderer/components/Confirm'
import { AccountSection } from './AccountSection'

function UnsubscribeEditor(): ReactNode {
  const { settings, update } = useSettings()
  const [html, setHtml] = useState(settings?.unsubscribeHtml ?? '')
  useEffect(() => {
    if (html === settings?.unsubscribeHtml) return
    const id = setTimeout(() => void update({ unsubscribeHtml: html }), 600)
    return () => clearTimeout(id)
  }, [html, settings?.unsubscribeHtml, update])
  return (
    <div className="unsubscribe-editor">
      <RichEditor
        value={html}
        onChange={setHtml}
        variables={[]}
        minHeight={80}
        ariaLabel={t('settings.unsubscribe')}
      />
    </div>
  )
}

export function SettingsScreen(): ReactNode {
  const { settings, info, update } = useSettings()
  const section = useNav((s) => s.params.section)
  const restartOnboarding = useOnboarding((s) => s.restart)
  const [busy, setBusy] = useState<'export' | 'import' | null>(null)

  useEffect(() => {
    if (typeof section === 'string') {
      document
        .getElementById(`settings-${section}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [section, settings])

  if (!settings || !info) {
    return (
      <div className="screen">
        <SkeletonRows />
      </div>
    )
  }

  const exportBackup = async (): Promise<void> => {
    setBusy('export')
    try {
      const path = await call('backup:export')
      if (path) toast.success(t('settings.backupExported'), path)
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(null)
    }
  }

  const importBackup = async (): Promise<void> => {
    const ok = await confirm({
      title: t('settings.backupImportTitle'),
      description: t('settings.backupImportText'),
      confirmLabel: t('settings.backupImport'),
      destructive: true,
    })
    if (!ok) return
    setBusy('import')
    try {
      if (await call('backup:import')) toast.info(t('settings.backupRestoring'))
    } catch (error) {
      toast.error(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="screen">
      <div className="settings-wrap">
        <p className="page-intro">{t('settings.subtitle')}</p>

        <AccountSection />

        <h2 className="group-title" id="settings-sending">
          {t('settings.sending')}
        </h2>
        <div className="group">
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.speed')}</div>
              <div className="subtle">
                {settings.sendIntervalSeconds < 2 ? (
                  <span className="text-warning">{t('settings.speedWarning')}</span>
                ) : (
                  t('settings.speedHint')
                )}
              </div>
            </div>
            <select
              className="select"
              aria-label={t('settings.speed')}
              value={settings.sendIntervalSeconds}
              onChange={(e) => void update({ sendIntervalSeconds: Number(e.target.value) })}
            >
              {[1, 2, 3, 5, 10, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {tp('settings.speedValue', n)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="group-title" id="settings-privacy">
          {t('settings.privacy')}
        </h2>
        <div className="callout" style={{ marginBottom: 12 }}>
          <ShieldCheck size={16} />
          <div>
            <strong>{t('settings.gdprTitle')}.</strong> {t('settings.gdprText')}
          </div>
        </div>
        <div className="group">
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.unsubscribe')}</div>
              <div className="subtle">{t('settings.unsubscribeHint')}</div>
            </div>
            <Switch
              checked={settings.unsubscribeEnabled}
              onChange={(unsubscribeEnabled) => void update({ unsubscribeEnabled })}
              label={t('settings.unsubscribe')}
            />
          </div>
          {settings.unsubscribeEnabled && (
            <div className="group-row">
              <UnsubscribeEditor />
            </div>
          )}
        </div>

        <h2 className="group-title">{t('settings.appearance')}</h2>
        <div className="group">
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.theme')}</div>
              <div className="subtle">{t('settings.themeHint')}</div>
            </div>
            <Segmented<Theme>
              label={t('settings.theme')}
              value={settings.theme}
              onChange={(theme) => void update({ theme })}
              options={[
                { value: 'system', label: t('theme.system') },
                { value: 'light', label: t('theme.light') },
                { value: 'dark', label: t('theme.dark') },
              ]}
            />
          </div>
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.language')}</div>
              <div className="subtle">{t('settings.languageHint')}</div>
            </div>
            <select
              className="select"
              aria-label={t('settings.language')}
              value={settings.language}
              onChange={(e) => void update({ language: e.target.value as 'ro' })}
            >
              {Object.entries(languages).map(([code, lang]) => (
                <option key={code} value={code}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <h2 className="group-title" id="settings-data">
          {t('settings.data')}
        </h2>
        <div className="group">
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.dataLocation')}</div>
              <div className="subtle mono selectable truncate" title={info.dataPath}>
                {info.dataPath}
              </div>
            </div>
            <Button icon={<FolderOpen size={14} />} onClick={() => void call('app:openDataFolder')}>
              {t('settings.openFolder')}
            </Button>
          </div>
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.backup')}</div>
              <div className="subtle">{t('settings.backupHint')}</div>
            </div>
            <Button
              icon={<Archive size={14} />}
              loading={busy === 'export'}
              onClick={() => void exportBackup()}
            >
              {t('settings.backupExport')}
            </Button>
            <Button
              icon={<Upload size={14} />}
              loading={busy === 'import'}
              onClick={() => void importBackup()}
            >
              {t('settings.backupImport')}
            </Button>
          </div>
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.logs')}</div>
              <div className="subtle">{t('settings.logsHint')}</div>
            </div>
            <Button icon={<FileText size={14} />} onClick={() => void call('app:openLogs')}>
              {t('common.open')}
            </Button>
          </div>
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.onboardingRestart')}</div>
              <div className="subtle">{t('settings.onboardingRestartHint')}</div>
            </div>
            <Button icon={<RotateCcw size={14} />} onClick={restartOnboarding}>
              {t('settings.onboardingRestartAction')}
            </Button>
          </div>
        </div>

        <p className="subtle" style={{ marginTop: 24 }}>
          {info.name} · {t('settings.version', { version: info.version })}
        </p>
      </div>
    </div>
  )
}
