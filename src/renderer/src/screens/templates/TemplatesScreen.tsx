import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Mail, PenLine, Plus, Star, Trash2 } from 'lucide-react'
import type { Template } from '@shared/schemas/template'
import { useTemplates } from '@renderer/stores/templates'
import { useSettings } from '@renderer/stores/settings'
import { toast } from '@renderer/stores/toast'
import { call } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'
import { variableOptions } from '@renderer/lib/variables'
import { Badge, Button, EmptyState, Field, SkeletonRows } from '@renderer/components/ui'
import { RichEditor } from '@renderer/components/RichEditor'
import { VariableInput } from '@renderer/components/VariableInput'
import { TitlebarActions } from '@renderer/components/TitlebarActions'
import { confirm } from '@renderer/components/Confirm'
import { registerCommands } from '@renderer/components/CommandPalette'
import { PreviewPane } from './PreviewPane'

type Selection = { kind: 'template'; id: number } | { kind: 'signature' }
type SaveState = 'idle' | 'saving' | 'saved'

function useAutosave<T>(value: T, save: (value: T) => Promise<void>, delay = 600): SaveState {
  const [state, setState] = useState<SaveState>('idle')
  const first = useRef(true)
  const saveRef = useRef(save)
  saveRef.current = save
  const serialized = JSON.stringify(value)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setState('saving')
    const id = setTimeout(() => {
      saveRef
        .current(JSON.parse(serialized) as T)
        .then(() => setState('saved'))
        .catch((error: unknown) => {
          setState('idle')
          toast.error(error)
        })
    }, delay)
    return () => clearTimeout(id)
  }, [serialized, delay])
  return state
}

function SaveIndicator({ state }: { state: SaveState }): ReactNode {
  if (state === 'idle') return null
  return (
    <span className="subtle save-indicator" aria-live="polite">
      {state === 'saving' ? t('templates.saving') : t('templates.savedAt')}
    </span>
  )
}

function TemplateEditor({ template }: { template: Template }): ReactNode {
  const { extras, replace } = useTemplates()
  const [draft, setDraft] = useState({
    name: template.name,
    subject: template.subject,
    bodyHtml: template.bodyHtml,
  })
  const variables = useMemo(() => variableOptions(extras), [extras])
  const state = useAutosave(draft, async (d) => {
    replace(await call('templates:update', { id: template.id, patch: d }))
  })

  return (
    <>
      <TitlebarActions>
        <SaveIndicator state={state} />
      </TitlebarActions>
      <div className="template-editor">
        <Field label={t('templates.name')}>
          {(id) => (
            <input
              id={id}
              className="input"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onBlur={() => !draft.name.trim() && setDraft({ ...draft, name: template.name })}
            />
          )}
        </Field>
        <Field label={t('templates.subject')}>
          {(id) => (
            <VariableInput
              id={id}
              value={draft.subject}
              onChange={(subject) => setDraft({ ...draft, subject })}
              options={variables}
              placeholder={t('templates.subjectPlaceholder')}
            />
          )}
        </Field>
        <RichEditor
          value={draft.bodyHtml}
          onChange={(bodyHtml) => setDraft((d) => ({ ...d, bodyHtml }))}
          variables={variables}
          placeholder={t('templates.bodyPlaceholder')}
          ariaLabel={t('templates.bodyPlaceholder')}
        />
      </div>
      <PreviewPane source={{ draft: { subject: draft.subject, bodyHtml: draft.bodyHtml } }} />
    </>
  )
}

function SignatureEditor(): ReactNode {
  const { settings, update } = useSettings()
  const { extras, templates } = useTemplates()
  const [html, setHtml] = useState(settings?.signatureHtml ?? '')
  const variables = useMemo(() => variableOptions(extras), [extras])
  const state = useAutosave(html, async (signatureHtml) => update({ signatureHtml }))
  const def = templates.find((x) => x.isDefault) ?? templates[0]
  return (
    <>
      <TitlebarActions>
        <SaveIndicator state={state} />
      </TitlebarActions>
      <div className="template-editor">
        <div>
          <h2 className="section-title">{t('templates.signatureTitle')}</h2>
          <p className="muted">{t('templates.signatureHint')}</p>
        </div>
        <RichEditor
          value={html}
          onChange={setHtml}
          variables={variables}
          minHeight={160}
          placeholder={t('templates.signaturePlaceholder')}
          ariaLabel={t('templates.signatureTitle')}
        />
      </div>
      <PreviewPane
        // Re-render the preview when the saved signature changes.
        key={state}
        source={def ? { templateId: def.id } : { draft: { subject: '', bodyHtml: '' } }}
      />
    </>
  )
}

export function TemplatesScreen(): ReactNode {
  const { templates, loaded, load } = useTemplates()
  const [selection, setSelection] = useState<Selection | null>(null)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!loaded) return
    if (selection?.kind === 'signature') return
    if (selection && templates.some((x) => x.id === selection.id)) return
    const first = templates.find((x) => x.isDefault) ?? templates[0]
    setSelection(first ? { kind: 'template', id: first.id } : null)
  }, [loaded, templates, selection])

  const create = useCallback(async () => {
    try {
      const isFirst = useTemplates.getState().templates.length === 0
      const id = await call('templates:create', {
        name: isFirst
          ? t('templates.starterSubject').replace(' {{produs}}', '')
          : t('templates.newName'),
        subject: isFirst ? t('templates.starterSubject') : '',
        bodyHtml: isFirst ? t('templates.starterBody') : '',
      })
      await load()
      setSelection({ kind: 'template', id })
    } catch (error) {
      toast.error(error)
    }
  }, [load])

  useEffect(
    () =>
      registerCommands('templates', [
        {
          id: 'template-add',
          label: t('templates.add'),
          icon: <Plus size={16} />,
          run: () => void create(),
        },
      ]),
    [create],
  )

  const remove = async (tpl: Template): Promise<void> => {
    const ok = await confirm({
      title: t('templates.deleteTitle', { name: tpl.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    try {
      await call('templates:delete', { id: tpl.id })
      setSelection(null)
      toast.success(t('templates.deleted'), undefined, {
        label: t('common.undo'),
        run: () =>
          void call('templates:create', {
            name: tpl.name,
            subject: tpl.subject,
            bodyHtml: tpl.bodyHtml,
          })
            .then((id) => setSelection({ kind: 'template', id }))
            .catch(toast.error),
      })
    } catch (error) {
      toast.error(error)
    }
  }

  const current =
    selection?.kind === 'template' ? templates.find((x) => x.id === selection.id) : undefined

  if (!loaded) {
    return (
      <div className="screen">
        <SkeletonRows rows={8} />
      </div>
    )
  }

  return (
    <div className="templates-layout">
      <nav className="template-list" aria-label={t('nav.templates')}>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={() => void create()}
        >
          {t('templates.add')}
        </Button>
        <ul>
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                className={cx('template-item', current?.id === tpl.id && 'is-active')}
                aria-current={current?.id === tpl.id ? 'true' : undefined}
                onClick={() => setSelection({ kind: 'template', id: tpl.id })}
              >
                <span className="row" style={{ gap: 6 }}>
                  <span className="truncate template-item-name">{tpl.name}</span>
                  {tpl.isDefault && <Badge tone="accent">{t('templates.default')}</Badge>}
                </span>
                <span className="subtle truncate">{tpl.subject || '—'}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="grow" />
        <button
          type="button"
          className={cx('template-item', selection?.kind === 'signature' && 'is-active')}
          onClick={() => setSelection({ kind: 'signature' })}
        >
          <span className="row" style={{ gap: 6 }}>
            <PenLine size={14} />
            {t('templates.tabSignature')}
          </span>
        </button>
      </nav>

      {selection?.kind === 'signature' ? (
        <SignatureEditor />
      ) : current ? (
        <>
          <TitlebarActions>
            {!current.isDefault && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Star size={14} />}
                onClick={() =>
                  void call('templates:setDefault', { id: current.id }).catch(toast.error)
                }
              >
                {t('templates.makeDefault')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<Copy size={14} />}
              onClick={() =>
                void call('templates:duplicate', { id: current.id })
                  .then((id) => setSelection({ kind: 'template', id }))
                  .catch(toast.error)
              }
            >
              {t('templates.duplicate')}
            </Button>
            <Button
              size="sm"
              variant="danger-ghost"
              icon={<Trash2 size={14} />}
              aria-label={t('common.delete')}
              onClick={() => void remove(current)}
            />
          </TitlebarActions>
          <TemplateEditor key={current.id} template={current} />
        </>
      ) : (
        <div className="templates-empty">
          <EmptyState
            icon={<Mail size={26} />}
            title={t('templates.emptyTitle')}
            description={t('templates.emptyText')}
            action={
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => void create()}>
                {t('templates.emptyAction')}
              </Button>
            }
          />
        </div>
      )}
    </div>
  )
}
