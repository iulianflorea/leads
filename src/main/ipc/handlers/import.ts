import { BrowserWindow, dialog } from 'electron'
import { t } from '@shared/i18n'
import type { AppContext } from '../../context'
import { broadcast, type Handlers } from '../registry'
import { SUPPORTED_EXTENSIONS } from '../../import/parser'

export function importHandlers(ctx: AppContext): Partial<Handlers> {
  return {
    'import:pickFile': async (_input, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: t('import.pickTitle'),
        properties: ['openFile'],
        filters: [{ name: t('import.fileFilter'), extensions: SUPPORTED_EXTENSIONS }],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    'import:open': ({ path }) => ctx.importer.openFile(path),
    'import:preview': ({ token, sheet }) => ctx.importer.preview(token, sheet),
    'import:validate': ({ token, sheet, mapping }) => ctx.importer.validate(token, sheet, mapping),
    'import:commit': (input) => {
      const result = ctx.importer.commit(input)
      broadcast('data:changed', { scope: ['leads', 'lists'] })
      return result
    },
    'import:close': ({ token }) => ctx.importer.close(token),
  }
}
