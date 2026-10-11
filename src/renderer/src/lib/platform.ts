import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export const platform = window.lm.platform
export const isMac = platform === 'darwin'

/** Label for the primary modifier key: ⌘ on macOS, Ctrl elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl'

export function isModEvent(e: KeyboardEvent | ReactKeyboardEvent): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
