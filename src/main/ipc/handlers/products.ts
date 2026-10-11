import { BrowserWindow, dialog, shell } from 'electron'
import { t } from '@shared/i18n'
import type { AppContext } from '../../context'
import { broadcast, type Handlers } from '../registry'

const changed = (): void => broadcast('data:changed', { scope: ['products', 'leads'] })

export function productHandlers(ctx: AppContext): Partial<Handlers> {
  return {
    'products:list': () => ctx.products.list(),
    'products:create': (input) => {
      const id = ctx.products.create(input)
      changed()
      return id
    },
    'products:update': ({ id, patch }) => {
      ctx.products.update(id, patch)
      changed()
    },
    'products:delete': ({ id }) => {
      ctx.products.delete(id)
      changed()
    },
    'products:pickPdf': async ({ id }, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const options: Electron.OpenDialogOptions = {
        title: t('products.pickPdf'),
        properties: ['openFile'],
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      }
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options)
      const path = result.filePaths[0]
      if (result.canceled || !path) return false
      ctx.products.attachPdf(id, path)
      changed()
      return true
    },
    'products:attachPdf': ({ id, path }) => {
      ctx.products.attachPdf(id, path)
      changed()
    },
    'products:removePdf': ({ id }) => {
      ctx.products.removePdf(id)
      changed()
    },
    'products:openPdf': async ({ id }) => {
      await shell.openPath(ctx.products.pdfPath(id))
    },
    'products:unmatched': () => ctx.products.unmatched(),
    'products:ignored': () => ctx.products.ignoredValues(),
    'products:resolve': (input) => {
      ctx.products.resolveValue(input)
      changed()
    },
    'products:unignore': ({ valueNorm }) => {
      ctx.products.unignore(valueNorm)
      changed()
    },
  }
}
