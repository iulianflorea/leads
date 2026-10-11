import { type ReactNode } from 'react'
import { LogIn } from 'lucide-react'
import { useAccount } from '@renderer/stores/account'
import { useNav } from '@renderer/stores/nav'
import { t } from '@renderer/lib/i18n'
import { Badge } from './ui'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Sidebar footer: who is sending, or a prompt to connect. */
export function AccountChip(): ReactNode {
  const status = useAccount((s) => s.status)
  const go = useNav((s) => s.go)
  if (!status) return null
  if (!status.account) {
    return (
      <button
        type="button"
        className="account-chip account-chip-empty"
        onClick={() => go('settings', { section: 'account' })}
      >
        <LogIn size={15} />
        <span>{t('account.sidebarConnect')}</span>
      </button>
    )
  }
  const { account } = status
  return (
    <button
      type="button"
      className="account-chip"
      title={account.email}
      onClick={() => go('settings', { section: 'account' })}
    >
      <span className="avatar" aria-hidden>
        {initials(account.name || account.email)}
      </span>
      <span className="account-text">
        <span className="truncate">{account.name}</span>
        <span className="subtle truncate">{account.email}</span>
      </span>
      {status.provider === 'mock' && <Badge tone="warning">{t('account.demoBadge')}</Badge>}
    </button>
  )
}
