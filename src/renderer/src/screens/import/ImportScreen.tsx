import { type ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useImport, type ImportStep } from '@renderer/stores/import'
import { t, type MessageKey } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'
import { FileStep } from './FileStep'
import { MappingStep } from './MappingStep'
import { ReviewStep } from './ReviewStep'
import { DoneStep } from './DoneStep'

const steps: Array<{ id: ImportStep; label: MessageKey }> = [
  { id: 'file', label: 'import.stepFile' },
  { id: 'mapping', label: 'import.stepMapping' },
  { id: 'review', label: 'import.stepReview' },
  { id: 'done', label: 'import.stepDone' },
]

function Stepper({ current }: { current: ImportStep }): ReactNode {
  const index = steps.findIndex((s) => s.id === current)
  return (
    <ol className="stepper" aria-label="Pași import">
      {steps.map((s, i) => (
        <li
          key={s.id}
          className={cx('step', i < index && 'step-done', i === index && 'step-current')}
          aria-current={i === index ? 'step' : undefined}
        >
          <span className="step-dot">
            {i < index ? <Check size={12} strokeWidth={3} /> : i + 1}
          </span>
          {t(s.label)}
        </li>
      ))}
    </ol>
  )
}

export function ImportScreen(): ReactNode {
  const step = useImport((s) => s.step)
  const reset = useImport((s) => s.reset)

  // A finished import starts fresh next time the screen opens.
  useEffect(() => {
    if (useImport.getState().step === 'done') reset()
  }, [reset])

  return (
    <div className="screen">
      <div className="import-wrap">
        <Stepper current={step} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 'file' && <FileStep />}
            {step === 'mapping' && <MappingStep />}
            {step === 'review' && <ReviewStep />}
            {step === 'done' && <DoneStep />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
