import { app, shell } from 'electron'
import { APP_NAME } from '@shared/config'
import type { Platform } from '@shared/types'
import type { AppContext } from '../../context'
import type { Handlers } from '../registry'
import { broadcast } from '../registry'
import { logger } from '../../logger'

export function appHandlers(ctx: AppContext): Partial<Handlers> {
  return {
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
    'app:openLogs': () => {
      shell.showItemInFolder(logger.transports.file.getFile().path)
    },
    'settings:get': () => ctx.settings.get(),
    'settings:update': (patch) => {
      const next = ctx.settings.update(patch)
      broadcast('settings:changed', next)
      return next
    },
  }
}
