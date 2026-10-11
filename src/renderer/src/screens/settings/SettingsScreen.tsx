import { type ReactNode, useEffect } from 'react'
import { FolderOpen } from 'lucide-react'
import type { Theme } from '@shared/schemas/settings'
import { languages } from '@shared/i18n'
import { useSettings } from '@renderer/stores/settings'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { Button, Segmented, SkeletonRows } from '@renderer/components/ui'
import { useNav } from '@renderer/stores/nav'
import { AccountSection } from './AccountSection'

export function SettingsScreen(): ReactNode {
  const { settings, info, update } = useSettings()
  const section = useNav((s) => s.params.section)
  useEffect(() => {
    if (typeof section === 'string') {
      document
        .getElementById(`settings-${section}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [section, settings])
  if (!settings || !info)
    return (
      <div className="screen">
        <SkeletonRows />
      </div>
    )

  return (
    <div className="screen">
      <div style={{ maxWidth: 720 }}>
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

        <h2 className="group-title">{t('settings.data')}</h2>
        <div className="group">
          <div className="group-row">
            <div className="group-row-label">
              <div>{t('settings.dataLocation')}</div>
              <div className="subtle mono selectable truncate">{info.dataPath}</div>
            </div>
            <Button icon={<FolderOpen size={14} />} onClick={() => void call('app:openDataFolder')}>
              {t('settings.openFolder')}
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
