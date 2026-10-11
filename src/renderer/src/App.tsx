import { type ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useNav } from './stores/nav'
import { useSettings } from './stores/settings'
import { useAccount } from './stores/account'
import { setErrorActionResolver } from './stores/toast'
import { screenDef, screens } from './screens/registry'
import { Sidebar } from './components/Sidebar'
import { Toaster } from './components/Toaster'
import { ConfirmHost } from './components/Confirm'
import { CommandPalette } from './components/CommandPalette'
import { SendDialogHost } from './screens/send/SendDialog'
import { Button, Kbd } from './components/ui'
import { isModEvent, modKey } from './lib/platform'
import { t } from './lib/i18n'

function useGlobalShortcuts(): void {
  const { go, setPaletteOpen } = useNav()
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!isModEvent(e) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'k') {
        e.preventDefault()
        setPaletteOpen(!useNav.getState().paletteOpen)
        return
      }
      if (key === 'f') {
        const input = document.querySelector<HTMLInputElement>('[data-search]')
        if (input) {
          e.preventDefault()
          input.focus()
          input.select()
        }
        return
      }
      const target = screens.find((s) => s.shortcut === key)
      if (target) {
        e.preventDefault()
        go(target.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, setPaletteOpen])
}

setErrorActionResolver((code) => {
  if (code === 'authExpired' || code === 'authRequired') {
    return { label: t('actions.reconnect'), run: () => void useAccount.getState().login() }
  }
  if (code === 'authNotConfigured' || code.startsWith('smtp')) {
    return {
      label: t('actions.openSettings'),
      run: () => useNav.getState().go('settings', { section: 'account' }),
    }
  }
  return undefined
})

export function App(): ReactNode {
  const screen = useNav((s) => s.screen)
  const setPaletteOpen = useNav((s) => s.setPaletteOpen)
  const load = useSettings((s) => s.load)
  useGlobalShortcuts()

  useEffect(() => {
    void load()
    void useAccount.getState().load()
  }, [load])

  const def = screenDef(screen)
  const ScreenComponent = def.component

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <header className="titlebar drag">
          <h1 className="titlebar-title">{t(def.label)}</h1>
          <div className="titlebar-actions" id="titlebar-actions" />
          <Button
            size="sm"
            variant="ghost"
            icon={<Search size={14} />}
            onClick={() => setPaletteOpen(true)}
            aria-label={t('palette.placeholder')}
          >
            <Kbd>{modKey} K</Kbd>
          </Button>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={screen}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <ScreenComponent />
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandPalette />
      <SendDialogHost />
      <ConfirmHost />
      <Toaster />
    </div>
  )
}
