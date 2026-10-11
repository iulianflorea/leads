import { type ComponentType, type ReactNode } from 'react'
import {
  FileSpreadsheet,
  History,
  Mail,
  Package,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react'
import type { Screen } from '@renderer/stores/nav'
import type { MessageKey } from '@renderer/lib/i18n'
import { SettingsScreen } from './SettingsScreen'
import { ComingSoon } from './ComingSoon'
import { ImportScreen } from './import/ImportScreen'
import { LeadsScreen } from './leads/LeadsScreen'

export interface ScreenDef {
  id: Screen
  label: MessageKey
  icon: ReactNode
  component: ComponentType
  /** Digit used with Cmd/Ctrl for quick switching. */
  shortcut: string
}

export const screens: ScreenDef[] = [
  {
    id: 'leads',
    label: 'nav.leads',
    icon: <Users size={16} />,
    component: LeadsScreen,
    shortcut: '1',
  },
  {
    id: 'import',
    label: 'nav.import',
    icon: <FileSpreadsheet size={16} />,
    component: ImportScreen,
    shortcut: '2',
  },
  {
    id: 'products',
    label: 'nav.products',
    icon: <Package size={16} />,
    component: ComingSoon,
    shortcut: '3',
  },
  {
    id: 'templates',
    label: 'nav.templates',
    icon: <Mail size={16} />,
    component: ComingSoon,
    shortcut: '4',
  },
  {
    id: 'history',
    label: 'nav.history',
    icon: <History size={16} />,
    component: ComingSoon,
    shortcut: '5',
  },
  {
    id: 'settings',
    label: 'nav.settings',
    icon: <SettingsIcon size={16} />,
    component: SettingsScreen,
    shortcut: ',',
  },
]

export function screenDef(id: Screen): ScreenDef {
  return screens.find((s) => s.id === id) ?? screens[0]!
}
