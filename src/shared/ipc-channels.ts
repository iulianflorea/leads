import type { ChannelName, EventName } from './ipc-contract'

/**
 * Plain list of channel names, imported by the preload script to whitelist
 * calls without bundling zod. Kept in sync with `ipcContract` by the type checks below.
 */
export const channelNames = [
  'app:getInfo',
  'app:openDataFolder',
  'settings:get',
  'settings:update',
] as const satisfies readonly ChannelName[]

export const eventNames = ['settings:changed'] as const satisfies readonly EventName[]

type Missing<A, B> = Exclude<A, B>
// Compile-time guard: fails if a contract channel is missing from the list above.
export const _channelsComplete: Missing<ChannelName, (typeof channelNames)[number]> extends never
  ? true
  : never = true
export const _eventsComplete: Missing<EventName, (typeof eventNames)[number]> extends never
  ? true
  : never = true
