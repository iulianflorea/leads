import { type ReactNode } from 'react'
import { FolderOpen } from 'lucide-react'
import type { Theme } from '@shared/schemas/settings'
import { languages } from '@shared/i18n'
import { useSettings } from '@renderer/stores/settings'
import { call } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { Button, Segmented, SkeletonRows } from '@renderer/components/ui'

export function SettingsScreen(): ReactNode {
  const { settings, info, update } = useSettings()
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
