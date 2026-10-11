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
}
export type EventName = keyof IpcEvents
