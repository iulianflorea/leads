import { z } from 'zod'
import { settingsPatchSchema, type Settings } from './schemas/settings'
import type { AppInfo } from './types'

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
}
export type EventName = keyof IpcEvents
