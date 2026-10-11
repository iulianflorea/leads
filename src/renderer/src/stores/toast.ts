import { create } from 'zustand'
import { t } from '@renderer/lib/i18n'
import { errorCode } from '@renderer/lib/api'
import type { MessageKey } from '@shared/i18n'

export type ToastKind = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  run(): void
}

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  description?: string
  action?: ToastAction
  duration: number
}

interface ToastState {
  toasts: Toast[]
  push(toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }): number
  dismiss(id: number): void
}

let nextId = 1

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(toast) {
    const id = nextId++
    const duration = toast.duration ?? (toast.action ? 7000 : 4000)
    set({ toasts: [...get().toasts.slice(-3), { ...toast, id, duration }] })
    if (duration > 0) setTimeout(() => get().dismiss(id), duration)
    return id
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((x) => x.id !== id) })
  },
}))

type ErrorActionResolver = (code: ReturnType<typeof errorCode>) => ToastAction | undefined
let resolveErrorAction: ErrorActionResolver = () => undefined

/** Lets the app attach a suggested action (e.g. "Reconnect") to error toasts by code. */
export function setErrorActionResolver(resolver: ErrorActionResolver): void {
  resolveErrorAction = resolver
}

export const toast = {
  success: (title: string, description?: string, action?: ToastAction) =>
    useToasts.getState().push({ kind: 'success', title, description, action }),
  info: (title: string, description?: string, action?: ToastAction) =>
    useToasts.getState().push({ kind: 'info', title, description, action }),
  warning: (title: string, description?: string, action?: ToastAction) =>
    useToasts.getState().push({ kind: 'warning', title, description, action }),
  /** Shows the human-readable message for an API error code. */
  error: (error: unknown, action?: ToastAction) =>
    useToasts.getState().push({
      kind: 'error',
      title: t('errors.title'),
      description: t(`errors.${errorCode(error)}` as MessageKey),
      action: action ?? resolveErrorAction(errorCode(error)),
      duration: 8000,
    }),
}
