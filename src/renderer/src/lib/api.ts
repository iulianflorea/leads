import type {
  ChannelInput,
  ChannelName,
  ChannelOutput,
  EventName,
  IpcEvents,
} from '@shared/ipc-contract'
import { isErrorCode, type ErrorCode } from '@shared/errors'

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly detail?: string,
  ) {
    super(detail ?? code)
    this.name = 'ApiError'
  }
}

type Args<C extends ChannelName> =
  undefined extends ChannelInput<C> ? [input?: ChannelInput<C>] : [input: ChannelInput<C>]

/** Typed IPC call. Throws ApiError with a stable code on failure. */
export async function call<C extends ChannelName>(
  channel: C,
  ...args: Args<C>
): Promise<ChannelOutput<C>> {
  const result = await window.lm.invoke(channel, args[0])
  if (result.ok) return result.data as ChannelOutput<C>
  throw new ApiError(
    isErrorCode(result.error.code) ? result.error.code : 'unknown',
    result.error.detail,
  )
}

export function subscribe<E extends EventName>(
  event: E,
  listener: (payload: IpcEvents[E]) => void,
): () => void {
  return window.lm.on(event, listener)
}

export function errorCode(error: unknown): ErrorCode {
  return error instanceof ApiError ? error.code : 'unknown'
}
