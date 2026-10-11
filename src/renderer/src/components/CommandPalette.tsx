import { type ReactNode, useMemo, useRef } from 'react'
import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import { Monitor, Moon, Sun } from 'lucide-react'
import { create } from 'zustand'
import { useNav } from '@renderer/stores/nav'
import { useSettings } from '@renderer/stores/settings'
import { screens } from '@renderer/screens/registry'
import { t } from '@renderer/lib/i18n'
import { useFocusTrap } from './Modal'

export interface PaletteCommand {
  id: string
  label: string
  icon?: ReactNode
  keywords?: string[]
  run(): void
}

/** Screens register context-specific commands here while mounted. */
export const usePaletteCommands = create<{ commands: Record<string, PaletteCommand[]> }>(() => ({
  commands: {},
}))

export function registerCommands(scope: string, commands: PaletteCommand[]): () => void {
  usePaletteCommands.setState((s) => ({ commands: { ...s.commands, [scope]: commands } }))
  return () =>
    usePaletteCommands.setState((s) => {
      const next = { ...s.commands }
      delete next[scope]
      return { commands: next }
    })
}

export function CommandPalette(): ReactNode {
  const { paletteOpen, setPaletteOpen } = useNav()
  return (
    <AnimatePresence>
      {paletteOpen && <PaletteInner onClose={() => setPaletteOpen(false)} />}
    </AnimatePresence>
  )
}

function PaletteInner({ onClose }: { onClose(): void }): ReactNode {
  const go = useNav((s) => s.go)
  const update = useSettings((s) => s.update)
  const scoped = usePaletteCommands((s) => s.commands)
  const extra = useMemo(() => Object.values(scoped).flat(), [scoped])
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true)

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  return (
    <motion.div
      className="overlay overlay-top"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.98, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.16 }}
      >
        <Command
          className="palette"
          label="Command palette"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
        >
          <Command.Input placeholder={t('palette.placeholder')} autoFocus />
          <Command.List>
            <Command.Empty>{t('palette.empty')}</Command.Empty>
            {extra.length > 0 && (
              <Command.Group heading={t('palette.groupActions')}>
                {extra.map((c) => (
                  <Command.Item key={c.id} keywords={c.keywords} onSelect={run(c.run)}>
                    {c.icon}
                    {c.label}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            <Command.Group heading={t('palette.groupNavigate')}>
              {screens.map((s) => (
                <Command.Item key={s.id} onSelect={run(() => go(s.id))}>
                  {s.icon}
                  {t('palette.goTo', { screen: t(s.label) })}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={t('settings.appearance')}>
              <Command.Item onSelect={run(() => void update({ theme: 'system' }))}>
                <Monitor size={16} />
                {t('palette.themeSystem')}
              </Command.Item>
              <Command.Item onSelect={run(() => void update({ theme: 'light' }))}>
                <Sun size={16} />
                {t('palette.themeLight')}
              </Command.Item>
              <Command.Item onSelect={run(() => void update({ theme: 'dark' }))}>
                <Moon size={16} />
                {t('palette.themeDark')}
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </motion.div>
    </motion.div>
  )
}
