import { z } from 'zod'
import { settingsPatchSchema, type Settings } from './schemas/settings'
import type { AppInfo } from './types'
import {
  idSchema,
  idsSchema,
  leadInputSchema,
  leadPatchSchema,
  leadQuerySchema,
  leadStatusSchema,
  type LeadDetail,
  type LeadRow,
  type ListSummary,
} from './schemas/lead'
import {
  importCommitSchema,
  importValidateSchema,
  sheetRefSchema,
  type ImportFileInfo,
  type ImportReport,
  type ImportResult,
  type SheetPreview,
} from './schemas/import'
import {
  productInputSchema,
  productPatchSchema,
  resolveValueSchema,
  type IgnoredValue,
  type Product,
  type UnmatchedValue,
} from './schemas/product'
import {
  previewInputSchema,
  templateInputSchema,
  templatePatchSchema,
  type EmailPreview,
  type Template,
} from './schemas/template'
import type { AccountStatus, OutlookAccount } from './schemas/mail'
import {
  bulkPrepareSchema,
  bulkStartSchema,
  historyQuerySchema,
  jobIdSchema,
  sendSingleSchema,
  sendTestSchema,
  type BulkSummary,
  type JobProgress,
  type LeadSendChecks,
  type SendOutcome,
  type SendRecord,
} from './schemas/send'

/**
 * Typed IPC contract. Every channel declares a zod schema for its input
 * (validated in the main process) and a phantom output type used by the renderer.
 */
interface Channel<I extends z.ZodType, O> {
  input: I
  /** Phantom field: carries the output type, never set at runtime. */
  readonly __output?: O
}

function channel<O>() {
  return <I extends z.ZodType>(input: I): Channel<I, O> => ({ input })
}

const none = z.undefined()

export const ipcContract = {
  'app:getInfo': channel<AppInfo>()(none),
  'app:openDataFolder': channel<void>()(none),
  'app:openLogs': channel<void>()(none),
  'settings:get': channel<Settings>()(none),
  'settings:update': channel<Settings>()(settingsPatchSchema),

  'lists:list': channel<ListSummary[]>()(none),
  'lists:create': channel<number>()(z.object({ name: z.string().trim().min(1).max(200) })),
  'lists:rename': channel<void>()(idSchema.extend({ name: z.string().trim().min(1).max(200) })),
  'lists:delete': channel<void>()(idSchema.extend({ withLeads: z.boolean() })),

  'leads:query': channel<LeadRow[]>()(leadQuerySchema),
  'leads:get': channel<LeadDetail>()(idSchema),
  'leads:create': channel<number>()(leadInputSchema),
  'leads:update': channel<LeadDetail>()(idSchema.extend({ patch: leadPatchSchema })),
  'leads:delete': channel<void>()(idsSchema),
  'leads:restore': channel<void>()(idsSchema),
  'leads:setStatus': channel<void>()(idsSchema.extend({ status: leadStatusSchema })),

  'import:pickFile': channel<string | null>()(none),
  'import:open': channel<ImportFileInfo>()(z.object({ path: z.string().min(1) })),
  'import:preview': channel<SheetPreview>()(sheetRefSchema),
  'import:validate': channel<ImportReport>()(importValidateSchema),
  'import:commit': channel<ImportResult>()(importCommitSchema),
  'import:close': channel<void>()(z.object({ token: z.string() })),

  'products:list': channel<Product[]>()(none),
  'products:create': channel<number>()(productInputSchema),
  'products:update': channel<void>()(idSchema.extend({ patch: productPatchSchema })),
  'products:delete': channel<void>()(idSchema),
  'products:pickPdf': channel<boolean>()(idSchema),
  'products:attachPdf': channel<void>()(idSchema.extend({ path: z.string().min(1) })),
  'products:removePdf': channel<void>()(idSchema),
  'products:openPdf': channel<void>()(idSchema),
  'products:unmatched': channel<UnmatchedValue[]>()(none),
  'products:ignored': channel<IgnoredValue[]>()(none),
  'products:resolve': channel<void>()(resolveValueSchema),
  'products:unignore': channel<void>()(z.object({ valueNorm: z.string() })),

  'templates:list': channel<Template[]>()(none),
  'templates:create': channel<number>()(templateInputSchema),
  'templates:update': channel<Template>()(idSchema.extend({ patch: templatePatchSchema })),
  'templates:delete': channel<void>()(idSchema),
  'templates:duplicate': channel<number>()(idSchema),
  'templates:setDefault': channel<void>()(idSchema),
  'templates:preview': channel<EmailPreview>()(previewInputSchema),
  'templates:variables': channel<string[]>()(none),

  'account:status': channel<AccountStatus>()(none),
  'account:login': channel<AccountStatus>()(none),
  'account:logout': channel<AccountStatus>()(none),
  'account:setSmtpPassword': channel<void>()(
    z.object({ password: z.string().max(1000).nullable() }),
  ),
  'account:testSmtp': channel<void>()(none),
  'account:outlookAccounts': channel<OutlookAccount[]>()(none),

  'send:checks': channel<LeadSendChecks>()(sendSingleSchema),
  'send:single': channel<SendOutcome>()(sendSingleSchema),
  'send:test': channel<string>()(sendTestSchema),
  'leads:history': channel<SendRecord[]>()(idSchema),

  'send:prepareBulk': channel<BulkSummary>()(bulkPrepareSchema),
  'send:startBulk': channel<number>()(bulkStartSchema),
  'queue:jobs': channel<JobProgress[]>()(none),
  'queue:pause': channel<void>()(jobIdSchema),
  'queue:resume': channel<void>()(jobIdSchema),
  'queue:cancel': channel<void>()(jobIdSchema),
  'queue:retryFailed': channel<number>()(jobIdSchema),

  'history:query': channel<SendRecord[]>()(historyQuerySchema),
  'history:get': channel<SendRecord & { bodyHtml: string }>()(idSchema),
  'history:exportCsv': channel<string | null>()(historyQuerySchema),
  'backup:export': channel<string | null>()(none),
  'backup:import': channel<boolean>()(none),
  'history:resolveUnknown': channel<void>()(
    idSchema.extend({ action: z.enum(['markSent', 'retry']) }),
  ),
} as const

export type IpcContract = typeof ipcContract
export type ChannelName = keyof IpcContract
export type ChannelInput<C extends ChannelName> = z.input<IpcContract[C]['input']>
export type ChannelParsedInput<C extends ChannelName> = z.output<IpcContract[C]['input']>
export type ChannelOutput<C extends ChannelName> =
  IpcContract[C] extends Channel<z.ZodType, infer O> ? O : never

/** Events pushed from main to renderer. */
export interface IpcEvents {
  'settings:changed': Settings
  /** Leads, lists or product matches changed; views should refetch. */
  'data:changed': { scope: Array<'leads' | 'lists' | 'products' | 'templates' | 'sends'> }
  'account:changed': AccountStatus
  'queue:progress': JobProgress
}
export type EventName = keyof IpcEvents
