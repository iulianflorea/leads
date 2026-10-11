import { type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToasts, type ToastKind } from '@renderer/stores/toast'
import { t } from '@renderer/lib/i18n'
import { Button } from './ui'

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  info: <Info size={18} />,
  warning: <AlertTriangle size={18} />,
}

export function Toaster(): ReactNode {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label="Notificări">
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            className={`toast toast-${item.kind}`}
            role={item.kind === 'error' ? 'alert' : 'status'}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="toast-icon">{icons[item.kind]}</span>
            <div className="toast-body">
              <div className="toast-title">{item.title}</div>
              {item.description && <div className="toast-desc">{item.description}</div>}
            </div>
            {item.action && (
              <Button
                size="sm"
                onClick={() => {
                  item.action?.run()
                  dismiss(item.id)
                }}
              >
                {item.action.label}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<X size={14} />}
              aria-label={t('common.close')}
              onClick={() => dismiss(item.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
