import type { ChannelName, EventName, IpcEvents } from './ipc-contract'
import type { IpcResult } from './errors'
import type { Platform } from './types'

/** The minimal API exposed on `window.lm` by the preload script. */
export interface Bridge {
  invoke(channel: ChannelName, payload?: unknown): Promise<IpcResult<unknown>>
  on<E extends EventName>(event: E, listener: (payload: IpcEvents[E]) => void): () => void
  /** Absolute path of a dropped File (drag & drop). */
  getPathForFile(file: File): string
  platform: Platform
}
