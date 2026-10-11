import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  FileSpreadsheet,
  FlaskConical,
  Mail,
  MonitorSmartphone,
  Send,
  Server,
  UserRound,
} from 'lucide-react'
import { APP_NAME } from '@shared/config'
import { useOnboarding } from '@renderer/stores/onboarding'
import { useAccount } from '@renderer/stores/account'
import { useSettings } from '@renderer/stores/settings'
import { useLists } from '@renderer/stores/lists'
import { useTemplates } from '@renderer/stores/templates'
import { useImport } from '@renderer/stores/import'
import { useNav } from '@renderer/stores/nav'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t, tp } from '@renderer/lib/i18n'
import { cx, platform } from '@renderer/lib/platform'
import { useFocusTrap } from '@renderer/components/Modal'
import { Button } from '@renderer/components/ui'
import { ClientIdForm } from '../settings/ClientIdForm'

const steps = [
  { title: 'onboarding.step1', text: 'onboarding.step1Text', icon: <UserRound size={16} /> },
  { title: 'onboarding.step2', text: 'onboarding.step2Text', icon: <FileSpreadsheet size={16} /> },
  { title: 'onboarding.step3', text: 'onboarding.step3Text', icon: <Mail size={16} /> },
] as const

function AccountStep({ next }: { next(): void }): ReactNode {
  const { status, connecting, login } = useAccount()
  const update = useSettings((s) => s.update)
  const hide = useOnboarding((s) => s.hide)
  const go = useNav((s) => s.go)
  if (status?.account) {
    return (
      <div className="stack">
        <div className="onb-done">
          <Check size={16} /> {t('onboarding.connected', { email: status.account.email })}
        </div>
        <div>
          <Button variant="primary" size="lg" onClick={next} data-autofocus>
            {t('common.next')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="stack">
      {status?.provider === 'graph' && status.configured && (
        <Button
          variant="primary"
          size="lg"
          loading={connecting}
          onClick={() => void login().then((ok) => ok && next())}
        >
          {t('account.connectOutlook')}
        </Button>
      )}
      {status?.provider === 'graph' && !status.configured && <ClientIdForm compact />}
      <div className="onb-alt">
        {platform === 'win32' && (
          <Button
            variant={status?.provider === 'graph' && status.configured ? 'secondary' : 'primary'}
            icon={<MonitorSmartphone size={14} />}
            onClick={() => {
              void update({ mailProvider: 'outlook' })
              hide()
              go('settings', { section: 'account' })
            }}
          >
            {t('onboarding.useOutlookDesktop')}
          </Button>
        )}
        <Button
          icon={<Server size={14} />}
          onClick={() => {
            void update({ mailProvider: 'smtp' })
            hide()
            go('settings', { section: 'account' })
          }}
        >
          {t('onboarding.useSmtp')}
        </Button>
        <Button
          icon={<FlaskConical size={14} />}
          onClick={() => void update({ mailProvider: 'mock' }).then(next)}
          data-testid="onboarding-demo"
        >
          {t('onboarding.useDemo')}
        </Button>
      </div>
    </div>
  )
}

function ImportStep({ next }: { next(): void }): ReactNode {
  const { lists, load } = useLists()
  const hide = useOnboarding((s) => s.hide)
  const go = useNav((s) => s.go)
  const openPath = useImport((s) => s.openPath)
  useEffect(() => {
    void load()
  }, [load])
  const total = lists.reduce((sum, l) => sum + l.leadCount, 0)
  if (total > 0) {
    return (
      <div className="stack">
        <div className="onb-done">
          <Check size={16} /> {tp('onboarding.imported', total)}
        </div>
        <div>
          <Button variant="primary" size="lg" onClick={next} data-autofocus>
            {t('common.next')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div>
      <Button
        variant="primary"
        size="lg"
        icon={<FileSpreadsheet size={16} />}
        data-autofocus
        data-testid="onboarding-import"
        onClick={async () => {
          try {
            const path = await call('import:pickFile')
            if (!path) return
            hide({ resumeAfterImport: true })
            go('import')
            await openPath(path)
          } catch (error) {
            toast.error(error)
          }
        }}
      >
        {t('onboarding.importButton')}
      </Button>
    </div>
  )
}

function TemplateStep({ finish }: { finish(): void }): ReactNode {
  const { templates, loaded, load } = useTemplates()
  const go = useNav((s) => s.go)
  useEffect(() => {
    void load()
  }, [load])
  if (!loaded) return null
  if (templates.length > 0) {
    return (
      <div className="stack">
        <div className="onb-done">
          <Check size={16} /> {t('onboarding.templateReady', { name: templates[0]!.name })}
        </div>
        <div>
          <Button
            variant="primary"
            size="lg"
            icon={<Send size={15} />}
            onClick={finish}
            data-autofocus
          >
            {t('onboarding.finish')}
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="onb-alt">
      <Button
        variant="primary"
        size="lg"
        data-autofocus
        data-testid="onboarding-starter"
        onClick={async () => {
          try {
            await call('templates:create', {
              name: t('templates.starterName'),
              subject: t('templates.starterSubject'),
              bodyHtml: t('templates.starterBody'),
            })
            finish()
            go('templates')
          } catch (error) {
            toast.error(error)
          }
        }}
      >
        {t('onboarding.useStarter')}
      </Button>
      <Button
        size="lg"
        onClick={() => {
          finish()
          go('templates')
        }}
      >
        {t('onboarding.createOwn')}
      </Button>
    </div>
  )
}

export function Onboarding(): ReactNode {
  const { open, step, setStep, hide, show } = useOnboarding()
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const shownOnce = useRef(false)
  const ref = useRef<HTMLDivElement>(null)
  const [direction, setDirection] = useState(1)
  useFocusTrap(ref, open)

  useEffect(() => {
    if (settings && !settings.onboardingDone && !shownOnce.current) {
      shownOnce.current = true
      show(0)
    }
    if (settings?.onboardingDone && open && !shownOnce.current) hide()
  }, [settings, show, hide, open])

  const goTo = (n: number): void => {
    setDirection(n > step ? 1 : -1)
    setStep(n)
  }
  const finish = (): void => {
    void update({ onboardingDone: true })
    hide()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay onb-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onb-title"
        >
          <motion.div
            ref={ref}
            className="onb-card"
            initial={{ scale: 0.97, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          >
            <aside className="onb-side">
              <div className="brand-mark onb-mark">
                <Send size={18} />
              </div>
              <h2 id="onb-title">{t('onboarding.welcome', { app: APP_NAME })}</h2>
              <p className="muted">{t('onboarding.intro')}</p>
              <ol className="onb-steps">
                {steps.map((s, i) => (
                  <li
                    key={s.title}
                    className={cx(i === step && 'is-current', i < step && 'is-done')}
                  >
                    <span className="onb-dot">
                      {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
                    </span>
                    {t(s.title)}
                  </li>
                ))}
              </ol>
            </aside>
            <section className="onb-main">
              <div className="subtle">{t('onboarding.stepOf', { n: step + 1 })}</div>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  className="onb-content"
                  initial={{ opacity: 0, x: 16 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 * direction }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="onb-icon">{steps[step]!.icon}</div>
                  <h3>{t(steps[step]!.title)}</h3>
                  <p className="muted">{t(steps[step]!.text)}</p>
                  {step === 0 && <AccountStep next={() => goTo(1)} />}
                  {step === 1 && <ImportStep next={() => goTo(2)} />}
                  {step === 2 && <TemplateStep finish={finish} />}
                </motion.div>
              </AnimatePresence>
              <div className="onb-footer">
                {step > 0 ? (
                  <Button variant="ghost" onClick={() => goTo(step - 1)}>
                    {t('common.back')}
                  </Button>
                ) : (
                  <span />
                )}
                <div className="row">
                  <Button variant="ghost" onClick={finish} data-testid="onboarding-skip-all">
                    {t('onboarding.later')}
                  </Button>
                  {step < 2 && (
                    <Button variant="ghost" onClick={() => goTo(step + 1)}>
                      {t('onboarding.skip')}
                    </Button>
                  )}
                </div>
              </div>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
