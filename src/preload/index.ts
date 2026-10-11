/// <reference lib="dom" />
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { channelNames, eventNames } from '../shared/ipc-channels'
import type { Bridge } from '../shared/bridge'
import type { Platform } from '../shared/types'

const allowedChannels = new Set<string>(channelNames)
const allowedEvents = new Set<string>(eventNames)

const bridge: Bridge = {
  invoke(channel, payload) {
    if (!allowedChannels.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, payload)
  },
  on(event, listener) {
    if (!allowedEvents.has(event)) throw new Error(`Blocked IPC event: ${event}`)
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown): void =>
      listener(payload as Parameters<typeof listener>[0])
    ipcRenderer.on(event, wrapped)
    return () => {
      ipcRenderer.removeListener(event, wrapped)
    }
  },
  getPathForFile(file) {
    return webUtils.getPathForFile(file)
  },
  platform: process.platform as Platform,
}

contextBridge.exposeInMainWorld('lm', bridge)

// Apply the resolved theme before the first paint, then follow changes.
let isDark = ipcRenderer.sendSync('theme:isDarkSync') === true
function applyTheme(): void {
  const root = document.documentElement
  if (!root) return
  root.dataset.theme = isDark ? 'dark' : 'light'
  root.dataset.platform = process.platform
}
if (document.documentElement) {
  applyTheme()
} else {
  // The <html> element does not exist yet when the preload runs.
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return
    observer.disconnect()
    applyTheme()
  })
  observer.observe(document, { childList: true })
}
ipcRenderer.on('theme:changed', (_e, dark: boolean) => {
  isDark = dark
  applyTheme()
})
