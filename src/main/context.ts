import type { DB } from './db/connection'
import type { SettingsService } from './services/settings'
import type { LeadsRepo } from './repos/leads'
import type { ListsRepo } from './repos/lists'
import type { MappingsRepo } from './repos/mappings'
import type { ImportService } from './import/service'
import type { ProductsService } from './services/products'
import type { TemplatesRepo } from './repos/templates'
import type { ProductsRepo } from './repos/products'
import type { MessageBuilder } from './services/message'
import type { MailService } from './mailer/service'
import type { SendsRepo } from './repos/sends'
import type { SendService } from './services/send'
import type { BulkService } from './services/bulk'
import type { QueueService } from './queue/service'
import type { HistoryService } from './services/history'

/** Services shared by IPC handlers. */
export interface AppContext {
  db: DB
  settings: SettingsService
  leads: LeadsRepo
  lists: ListsRepo
  mappings: MappingsRepo
  importer: ImportService
  products: ProductsService
  productsRepo: ProductsRepo
  templates: TemplatesRepo
  messages: MessageBuilder
  mail: MailService
  sends: SendsRepo
  sender: SendService
  bulk: BulkService
  queue: QueueService
  history: HistoryService
}
