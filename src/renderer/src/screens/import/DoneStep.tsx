import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useImport } from '@renderer/stores/import'
import { useNav } from '@renderer/stores/nav'
import { t, tp } from '@renderer/lib/i18n'
import { Button } from '@renderer/components/ui'

export function DoneStep(): ReactNode {
  const { result, reset } = useImport()
  const go = useNav((s) => s.go)
  if (!result) return null
  return (
    <div className="empty" style={{ paddingTop: 48 }}>
      <motion.div
        className="empty-icon done-icon"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18 }}
      >
        <CheckCircle2 size={30} />
      </motion.div>
      <h3>{t('import.doneTitle')}</h3>
      <p>
        {[
          tp('import.doneInserted', result.inserted),
          result.updated ? tp('import.doneUpdated', result.updated) : null,
          result.skipped ? tp('import.doneSkipped', result.skipped) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="row" style={{ marginTop: 8 }}>
        <Button onClick={reset}>{t('import.importAnother')}</Button>
        <Button
          variant="primary"
          data-autofocus
          onClick={() => {
            reset()
            go('leads', { listId: result.listId })
          }}
        >
          {t('import.viewLeads')}
        </Button>
      </div>
    </div>
  )
}
