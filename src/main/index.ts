import { app, BrowserWindow, Menu, shell } from 'electron'
import { APP_NAME } from '@shared/config'
import type { Platform } from '@shared/types'
import { logger } from './logger'
import { createMainWindow } from './window'
import { broadcast, registerIpc } from './ipc/registry'
import { MemorySettingsStore, SettingsService } from './services/settings'

app.setName(APP_NAME)
if (process.env.LEADMAILER_USER_DATA) app.setPath('userData', process.env.LEADMAILER_USER_DATA)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  void app.whenReady().then(bootstrap)
}

function buildMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]),
  )
}

function bootstrap(): void {
  logger.info(`[app] starting ${APP_NAME} ${app.getVersion()} on ${process.platform}`)
  buildMenu()

  const settings = new SettingsService(new MemorySettingsStore())

  registerIpc({
    'app:getInfo': () => ({
      name: APP_NAME,
      version: app.getVersion(),
      platform: process.platform as Platform,
      dataPath: app.getPath('userData'),
      logPath: logger.transports.file.getFile().path,
      isDev: !app.isPackaged,
    }),
    'app:openDataFolder': async () => {
      await shell.openPath(app.getPath('userData'))
    },
    'settings:get': () => settings.get(),
    'settings:update': (patch) => {
      const next = settings.update(patch)
      broadcast('settings:changed', next)
      return next
    },
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
