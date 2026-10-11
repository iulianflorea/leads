import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import {
  ipcContract,
  type ChannelName,
  type ChannelOutput,
  type ChannelParsedInput,
  type EventName,
  type IpcEvents,
} from '@shared/ipc-contract'
import { AppError, type IpcResult } from '@shared/errors'
import { logger } from '../logger'

type Handler<C extends ChannelName> = (
  input: ChannelParsedInput<C>,
  event: Electron.IpcMainInvokeEvent,
) => Promise<ChannelOutput<C>> | ChannelOutput<C>

export type Handlers = { [C in ChannelName]: Handler<C> }

function toResult(error: unknown, channel: string): IpcResult<never> {
  if (error instanceof AppError) {
    if (error.code === 'unknown') logger.error(`[ipc] ${channel}`, error)
    else logger.warn(`[ipc] ${channel} -> ${error.code}`)
    return { ok: false, error: error.toJSON() }
  }
  if (error instanceof z.ZodError) {
    logger.warn(`[ipc] ${channel} -> invalid payload`, z.prettifyError(error))
    return { ok: false, error: { code: 'validation', detail: z.prettifyError(error) } }
  }
  logger.error(`[ipc] ${channel} failed`, error)
  return {
    ok: false,
    error: { code: 'unknown', detail: error instanceof Error ? error.message : String(error) },
  }
}

/** Registers every handler; input is validated against the contract's zod schema. */
export function registerIpc(handlers: Partial<Handlers>): void {
  for (const name of Object.keys(handlers) as ChannelName[]) {
    const handler = handlers[name] as Handler<ChannelName> | undefined
    if (!handler) continue
    const schema = ipcContract[name].input
    ipcMain.removeHandler(name)
    ipcMain.handle(name, async (event, payload: unknown): Promise<IpcResult<unknown>> => {
      try {
        const input = schema.parse(payload) as ChannelParsedInput<ChannelName>
        const data = await handler(input, event)
        return { ok: true, data }
      } catch (error) {
        return toResult(error, name)
      }
    })
  }
}

export function broadcast<E extends EventName>(event: E, payload: IpcEvents[E]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, payload)
  }
}
