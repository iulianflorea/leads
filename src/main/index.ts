import { app, BrowserWindow, Menu } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '@shared/config'
import { logger } from './logger'
import { paths } from './paths'
import { createMainWindow } from './window'
import type { AppContext } from './context'
import { openDatabase } from './db/connection'
import { broadcast, registerIpc } from './ipc/registry'
import { appHandlers } from './ipc/handlers/app'
import { leadHandlers } from './ipc/handlers/leads'
import { importHandlers } from './ipc/handlers/import'
import { productHandlers } from './ipc/handlers/products'
import { templateHandlers } from './ipc/handlers/templates'
import { sendHandlers } from './ipc/handlers/send'
import { bulkHandlers } from './ipc/handlers/bulk'
import { SqliteSettingsStore } from './repos/settings'
import { LeadsRepo } from './repos/leads'
import { ListsRepo } from './repos/lists'
import { MappingsRepo } from './repos/mappings'
import { ProductsRepo } from './repos/products'
import { TemplatesRepo } from './repos/templates'
import { SendsRepo } from './repos/sends'
import { ImportService } from './import/service'
import { SettingsService } from './services/settings'
import { ProductsService } from './services/products'
import { MessageBuilder } from './services/message'
import { SendService } from './services/send'
import { BulkService } from './services/bulk'
import { HistoryService } from './services/history'
import { MailService } from './mailer/service'
import { QueueService } from './queue/service'
import { SqliteQueueStore } from './queue/store'
import { applyPendingRestore } from './services/backup'
import { backupHandlers } from './ipc/handlers/backup'

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

function createContext(): AppContext {
  if (
    applyPendingRestore({ dbFile: paths.db, pdfDir: paths.pdfs, stagingDir: paths.restoreStaging })
  ) {
    logger.info('[backup] restored data from a backup')
  }
  const db = openDatabase(paths.db)
  logger.info(`[db] schema version ${String(db.pragma('user_version', { simple: true }))}`)
  const pdfDir = (): string => paths.pdfs

  const settingsStore = new SqliteSettingsStore(db)
  const settings = new SettingsService(settingsStore)
  const leads = new LeadsRepo(db)
  const lists = new ListsRepo(db)
  const mappings = new MappingsRepo(db)
  const importer = new ImportService(db, leads, lists, mappings)
  const productsRepo = new ProductsRepo(db, pdfDir)
  const products = new ProductsService(productsRepo, leads, pdfDir)
  const templates = new TemplatesRepo(db)
  const messages = new MessageBuilder(db, leads, productsRepo, templates, settings, pdfDir)
  const mail = new MailService(settings, settingsStore, () => paths.root)
  const sends = new SendsRepo(db)
  const sender = new SendService(
    db,
    sends,
    messages,
    mail,
    (file) => join(pdfDir(), file),
    () => broadcast('data:changed', { scope: ['sends', 'leads'] }),
  )
  const bulk = new BulkService(db, sends, messages, settings)
  const queue = new QueueService(
    new SqliteQueueStore(db),
    sends,
    sender,
    mail,
    settings,
    (progress) => broadcast('queue:progress', progress),
  )
  const history = new HistoryService(sends)

  settings.onChange(() => {
    mail.onSettingsChanged()
    void mail.status().then((status) => broadcast('account:changed', status))
  })
  leads.purgeDeleted()

  return {
    db,
    settings,
    leads,
    lists,
    mappings,
    importer,
    products,
    productsRepo,
    templates,
    messages,
    mail,
    sends,
    sender,
    bulk,
    queue,
    history,
  }
}

function bootstrap(): void {
  logger.info(`[app] starting ${APP_NAME} ${app.getVersion()} on ${process.platform}`)
  buildMenu()
  const ctx = createContext()

  registerIpc({
    ...appHandlers(ctx),
    ...leadHandlers(ctx),
    ...importHandlers(ctx),
    ...productHandlers(ctx),
    ...templateHandlers(ctx),
    ...sendHandlers(ctx),
    ...bulkHandlers(ctx),
    ...backupHandlers(ctx),
  })

  // Sends interrupted by a crash or forced quit are checked; their jobs wait for "Resume".
  void ctx.queue.recover().then((jobs) => {
    if (jobs.length) logger.info(`[queue] ${jobs.length} interrupted job(s) paused`)
  })

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
  app.on('will-quit', () => ctx.db.close())
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
