import { type ReactNode } from 'react'
import { Send } from 'lucide-react'
import { APP_NAME } from '@shared/config'
import { useNav } from '@renderer/stores/nav'
import { screens } from '@renderer/screens/registry'
import { t } from '@renderer/lib/i18n'
import { AccountChip } from './AccountChip'

export function Sidebar({ footer }: { footer?: ReactNode }): ReactNode {
  const { screen, go } = useNav()
  return (
    <aside className="sidebar" aria-label="Navigare principală">
      <div className="sidebar-top drag">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden>
            <Send size={12} />
          </span>
          {APP_NAME}
        </div>
      </div>
      <nav className="nav">
        {screens
          .filter((s) => s.id !== 'settings')
          .map((s) => (
            <button
              key={s.id}
              type="button"
              className="nav-item"
              aria-current={screen === s.id ? 'page' : undefined}
              onClick={() => go(s.id)}
            >
              {s.icon}
              {t(s.label)}
            </button>
          ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        {footer}
        <AccountChip />
        <button
          type="button"
          className="nav-item"
          aria-current={screen === 'settings' ? 'page' : undefined}
          onClick={() => go('settings')}
        >
          {screens.find((s) => s.id === 'settings')?.icon}
          {t('nav.settings')}
        </button>
      </div>
    </aside>
  )
}
