import { BrowserWindow, dialog } from 'electron'
import { AppError } from '@shared/errors'
import { t } from '@shared/i18n'
import type { AppContext } from '../../context'
import { broadcast, type Handlers } from '../registry'

export function bulkHandlers(ctx: AppContext): Partial<Handlers> {
  return {
    'send:prepareBulk': ({ target, templateId }) => ctx.bulk.prepare(target, templateId),
    'send:startBulk': async (input) => {
      await ctx.mail.requireAccount()
      const jobId = ctx.bulk.create(input)
      ctx.queue.start(jobId)
      broadcast('data:changed', { scope: ['sends'] })
      return jobId
    },
    'queue:jobs': () => ctx.queue.jobs(),
    'queue:pause': ({ jobId }) => ctx.queue.queue.pause(jobId),
    'queue:resume': async ({ jobId }) => {
      await ctx.mail.requireAccount()
      ctx.queue.queue.resume(jobId)
    },
    'queue:cancel': ({ jobId }) => {
      ctx.queue.queue.cancel(jobId)
      broadcast('data:changed', { scope: ['sends'] })
    },
    'queue:retryFailed': async ({ jobId }) => {
      await ctx.mail.requireAccount()
      return ctx.queue.queue.retryFailed(jobId)
    },
    'history:query': (q) => ctx.history.query(q),
    'history:get': ({ id }) => {
      const row = ctx.sends.get(id)
      if (!row) throw new AppError('notFound', 'send')
      return row
    },
    'history:exportCsv': async (q, event) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const stamp = new Date().toISOString().slice(0, 10)
      const options: Electron.SaveDialogOptions = {
        title: t('history.exportTitle'),
        defaultPath: `istoric-emailuri-${stamp}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      }
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return null
      ctx.history.exportCsv(q, result.filePath)
      return result.filePath
    },
    'history:resolveUnknown': ({ id, action }) => {
      const row = ctx.sends.get(id)
      if (!row || row.status !== 'unknown') throw new AppError('notFound', 'send')
      if (action === 'markSent') ctx.sends.markSent(id)
      else {
        ctx.sends.setStatus(id, 'queued')
        ctx.queue.start(row.jobId)
      }
      broadcast('data:changed', { scope: ['sends', 'leads'] })
    },
  }
}
