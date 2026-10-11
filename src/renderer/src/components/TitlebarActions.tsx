import { type ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/** Renders children into the window title bar, next to the screen title. */
export function TitlebarActions({ children }: { children: ReactNode }): ReactNode {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => setTarget(document.getElementById('titlebar-actions')), [])
  return target ? createPortal(children, target) : null
}
