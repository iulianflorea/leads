import { app, BrowserWindow, Menu } from 'electron'
import { APP_NAME } from '@shared/config'
import { logger } from './logger'
import { createMainWindow } from './window'
import { registerIpc } from './ipc/registry'
import { SettingsService } from './services/settings'
import { openDatabase } from './db/connection'
import { SqliteSettingsStore } from './repos/settings'
import { LeadsRepo } from './repos/leads'
import { ListsRepo } from './repos/lists'
import { MappingsRepo } from './repos/mappings'
import { ImportService } from './import/service'
import { paths } from './paths'
import type { AppContext } from './context'
import { appHandlers } from './ipc/handlers/app'
import { leadHandlers } from './ipc/handlers/leads'
import { importHandlers } from './ipc/handlers/import'
import { productHandlers } from './ipc/handlers/products'
import { ProductsRepo } from './repos/products'
import { ProductsService } from './services/products'
import { TemplatesRepo } from './repos/templates'
import { MessageBuilder } from './services/message'
import { templateHandlers } from './ipc/handlers/templates'

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
  const db = openDatabase(paths.db)
  logger.info(`[db] schema version ${String(db.pragma('user_version', { simple: true }))}`)
  const settings = new SettingsService(new SqliteSettingsStore(db))
  const leads = new LeadsRepo(db)
  const lists = new ListsRepo(db)
  const mappings = new MappingsRepo(db)
  const importer = new ImportService(db, leads, lists, mappings)
  const productsRepo = new ProductsRepo(db, () => paths.pdfs)
  const products = new ProductsService(productsRepo, leads, () => paths.pdfs)
  const templates = new TemplatesRepo(db)
  const messages = new MessageBuilder(
    db,
    leads,
    productsRepo,
    templates,
    settings,
    () => paths.pdfs,
  )
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
