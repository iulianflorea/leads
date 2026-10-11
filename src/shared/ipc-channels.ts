import type { ChannelName, EventName } from './ipc-contract'

/**
 * Plain list of channel names, imported by the preload script to whitelist
 * calls without bundling zod. Kept in sync with `ipcContract` by the type checks below.
 */
export const channelNames = [
  'app:getInfo',
  'app:openDataFolder',
  'app:openLogs',
  'settings:get',
  'settings:update',
  'lists:list',
  'lists:create',
  'lists:rename',
  'lists:delete',
  'leads:query',
  'leads:get',
  'leads:create',
  'leads:update',
  'leads:delete',
  'leads:restore',
  'leads:setStatus',
  'import:pickFile',
  'import:open',
  'import:preview',
  'import:validate',
  'import:commit',
  'import:close',
  'products:list',
  'products:create',
  'products:update',
  'products:delete',
  'products:pickPdf',
  'products:attachPdf',
  'products:removePdf',
  'products:openPdf',
  'products:unmatched',
  'products:ignored',
  'products:resolve',
  'products:unignore',
  'templates:list',
  'templates:create',
  'templates:update',
  'templates:delete',
  'templates:duplicate',
  'templates:setDefault',
  'templates:preview',
  'templates:variables',
  'account:status',
  'account:login',
  'account:logout',
  'account:setSmtpPassword',
  'account:testSmtp',
  'account:outlookAccounts',
  'send:checks',
  'send:single',
  'send:test',
  'leads:history',
  'send:prepareBulk',
  'send:startBulk',
  'queue:jobs',
  'queue:pause',
  'queue:resume',
  'queue:cancel',
  'queue:retryFailed',
  'history:query',
  'history:get',
  'history:exportCsv',
  'history:resolveUnknown',
  'backup:export',
  'backup:import',
] as const satisfies readonly ChannelName[]

export const eventNames = [
  'settings:changed',
  'data:changed',
  'account:changed',
  'queue:progress',
] as const satisfies readonly EventName[]

type Missing<A, B> = Exclude<A, B>
// Compile-time guard: fails if a contract channel is missing from the list above.
export const _channelsComplete: Missing<ChannelName, (typeof channelNames)[number]> extends never
  ? true
  : never = true
export const _eventsComplete: Missing<EventName, (typeof eventNames)[number]> extends never
  ? true
  : never = true
