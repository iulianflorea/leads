import { type ReactNode, type RefObject, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cx } from '@renderer/lib/platform'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** Keeps keyboard focus inside `container` and restores it on unmount. */
export function useFocusTrap(container: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement as HTMLElement | null
    const node = container.current
    const first =
      node?.querySelector<HTMLElement>('[data-autofocus]') ??
      node?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || !node) return
      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [active, container])
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size,
  children,
  footer,
  dismissable = true,
}: {
  open: boolean
  onClose(): void
  title: string
  description?: ReactNode
  size?: 'lg' | 'xl'
  children?: ReactNode
  footer?: ReactNode
  dismissable?: boolean
}): ReactNode {
  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalInner
          onClose={onClose}
          title={title}
          description={description}
          size={size}
          footer={footer}
          dismissable={dismissable}
        >
          {children}
        </ModalInner>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function ModalInner({
  onClose,
  title,
  description,
  size,
  children,
  footer,
  dismissable,
}: {
  onClose(): void
  title: string
  description?: ReactNode
  size?: 'lg' | 'xl'
  children?: ReactNode
  footer?: ReactNode
  dismissable: boolean
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, true)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, dismissable])

  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose()
      }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={cx('dialog', size && `dialog-${size}`)}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="dialog-header">
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {children && <div className="dialog-body">{children}</div>}
        {footer && <div className="dialog-footer">{footer}</div>}
      </motion.div>
    </motion.div>
  )
}
