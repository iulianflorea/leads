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
}
