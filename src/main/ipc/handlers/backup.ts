import { app, BrowserWindow, dialog } from 'electron'
import { t } from '@shared/i18n'
import type { AppContext } from '../../context'
import type { Handlers } from '../registry'
import { paths } from '../../paths'
import { createBackup, stageRestore } from '../../services/backup'
import { logger } from '../../logger'

export function backupHandlers(ctx: AppContext): Partial<Handlers> {
  return {
    'backup:export': async (_input, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const stamp = new Date().toISOString().slice(0, 10)
      const options: Electron.SaveDialogOptions = {
        title: t('backup.exportTitle'),
        defaultPath: `leadmailer-backup-${stamp}.zip`,
        filters: [{ name: 'Backup', extensions: ['zip'] }],
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      const manifest = await createBackup({
        db: ctx.db,
        pdfDir: paths.pdfs,
        outFile: result.filePath,
        appVersion: app.getVersion(),
      })
      logger.info(`[backup] exported (schema ${manifest.schemaVersion}, ${manifest.pdfCount} PDFs)`)
      return result.filePath
    },
    'backup:import': async (_input, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: t('backup.importTitle'),
        properties: ['openFile'],
        filters: [{ name: 'Backup', extensions: ['zip'] }],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      const file = result.filePaths[0]
      if (result.canceled || !file) return false
      stageRestore({
        zipFile: file,
        stagingDir: paths.restoreStaging,
        currentSchema: ctx.db.pragma('user_version', { simple: true }) as number,
      })
      logger.info('[backup] restore staged; relaunching')
      // Swap the data on a clean start, with the database closed.
      setTimeout(() => {
        app.relaunch()
        app.exit(0)
      }, 300)
      return true
    },
  }
}
