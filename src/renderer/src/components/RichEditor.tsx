import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  Bold,
  Braces,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { filterVariables, type VariableOption } from '@renderer/lib/variables'
import { t } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'
import { VariableList } from './VariableMenu'

/** Highlights {{variables}} in the editor without changing the stored HTML. */
const VariableHighlight = Extension.create({
  name: 'variableHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('variableHighlight'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = []
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return
              for (const m of node.text.matchAll(/\{\{[^{}]+\}\}/g)) {
                const from = pos + (m.index ?? 0)
                decorations.push(
                  Decoration.inline(from, from + m[0].length, { class: 'var-token' }),
                )
              }
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

interface SuggestionState {
  items: VariableOption[]
  active: number
  rect: DOMRect | null
  command: ((item: VariableOption) => void) | null
}

function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}

export function RichEditor({
  value,
  onChange,
  variables,
  placeholder,
  minHeight = 260,
  ariaLabel,
}: {
  value: string
  onChange(html: string): void
  variables: VariableOption[]
  placeholder?: string
  minHeight?: number
  ariaLabel: string
}): ReactNode {
  const [suggest, setSuggest] = useState<SuggestionState | null>(null)
  const suggestRef = useLatest(suggest)
  const variablesRef = useLatest(variables)
  const onChangeRef = useLatest(onChange)

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer' },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      VariableHighlight,
      Extension.create({
        name: 'variableSuggestion',
        addProseMirrorPlugins() {
          return [
            Suggestion<VariableOption>({
              editor: this.editor,
              char: '{{',
              allowedPrefixes: null,
              allowSpaces: false,
              items: ({ query }) =>
                query.includes('}')
                  ? []
                  : filterVariables(variablesRef.current, query).slice(0, 50),
              command: ({ editor, range, props }) => {
                editor.chain().focus().insertContentAt(range, `{{${props.key}}} `).run()
              },
              render: () => {
                const update = (p: SuggestionProps<VariableOption>): void =>
                  setSuggest((s) => ({
                    items: p.items,
                    active: Math.min(s?.active ?? 0, Math.max(0, p.items.length - 1)),
                    rect: p.clientRect?.() ?? null,
                    command: (item) => p.command(item),
                  }))
                return {
                  onStart: update,
                  onUpdate: update,
                  onExit: () => setSuggest(null),
                  onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                    const s = suggestRef.current
                    if (!s || s.items.length === 0) return false
                    if (event.key === 'ArrowDown') {
                      setSuggest({ ...s, active: (s.active + 1) % s.items.length })
                      return true
                    }
                    if (event.key === 'ArrowUp') {
                      setSuggest({ ...s, active: (s.active - 1 + s.items.length) % s.items.length })
                      return true
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      s.command?.(s.items[s.active]!)
                      return true
                    }
                    if (event.key === 'Escape') {
                      setSuggest(null)
                      return true
                    }
                    return false
                  },
                }
              },
            }),
          ]
        },
      }),
    ],
    // Extensions are created once; changing values are read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const editor = useEditor({
    extensions,
    content: value,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'rich-content',
        'aria-label': ariaLabel,
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.isEmpty ? '' : e.getHTML()),
  })

  // Keep in sync when the value changes from outside (e.g. switching templates).
  useEffect(() => {
    if (editor && value !== editor.getHTML() && !(editor.isEmpty && !value)) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  return (
    <div className="rich-editor">
      {editor && <Toolbar editor={editor} variables={variables} />}
      <div className="rich-scroll" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      {suggest && suggest.rect && suggest.items.length > 0 && (
        <div
          className="var-menu var-menu-floating"
          style={{
            top: suggest.rect.bottom + 6,
            left: Math.min(suggest.rect.left, window.innerWidth - 320),
          }}
        >
          <VariableList
            items={suggest.items}
            active={suggest.active}
            onPick={(item) => suggest.command?.(item)}
            onHover={(active) => setSuggest({ ...suggest, active })}
          />
        </div>
      )}
    </div>
  )
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick(): void
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      className={cx('tool-btn', active && 'is-active')}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Toolbar({
  editor,
  variables,
}: {
  editor: Editor
  variables: VariableOption[]
}): ReactNode {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [varsOpen, setVarsOpen] = useState(false)
  const [varActive, setVarActive] = useState(0)
  const varsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!varsOpen) return
    const close = (e: MouseEvent): void => {
      if (!varsRef.current?.contains(e.target as Node)) setVarsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [varsOpen])

  const applyLink = (): void => {
    const url = linkUrl.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) chain.unsetLink().run()
    else chain.setLink({ href: /^(https?:|mailto:)/i.test(url) ? url : `https://${url}` }).run()
    setLinkOpen(false)
  }

  const insertVariable = (item: VariableOption): void => {
    editor.chain().focus().insertContent(`{{${item.key}}}`).run()
    setVarsOpen(false)
  }

  return (
    <div className="rich-toolbar" role="toolbar" aria-label="Formatare">
      <ToolButton
        label={t('templates.bold')}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold size={15} />
      </ToolButton>
      <ToolButton
        label={t('templates.italic')}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic size={15} />
      </ToolButton>
      <ToolButton
        label={t('templates.underline')}
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon size={15} />
      </ToolButton>
      <span className="tool-sep" />
      <ToolButton
        label={t('templates.heading')}
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 size={15} />
      </ToolButton>
      <ToolButton
        label={t('templates.bulletList')}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List size={15} />
      </ToolButton>
      <ToolButton
        label={t('templates.orderedList')}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered size={15} />
      </ToolButton>
      <ToolButton
        label={t('templates.link')}
        active={editor.isActive('link') || linkOpen}
        onClick={() => {
          setLinkUrl((editor.getAttributes('link').href as string | undefined) ?? '')
          setLinkOpen(!linkOpen)
        }}
      >
        <LinkIcon size={15} />
      </ToolButton>
      {linkOpen && (
        <input
          className="input link-input"
          autoFocus
          placeholder={t('templates.linkPrompt')}
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              applyLink()
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setLinkOpen(false)
            }
          }}
          onBlur={() => setLinkOpen(false)}
        />
      )}
      <span className="tool-sep" />
      <ToolButton
        label={t('templates.undo')}
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 size={15} />
      </ToolButton>
      <ToolButton
        label={t('templates.redo')}
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 size={15} />
      </ToolButton>
      <div className="grow" />
      <div className="var-dropdown" ref={varsRef}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-haspopup="listbox"
          aria-expanded={varsOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setVarActive(0)
            setVarsOpen(!varsOpen)
          }}
          onKeyDown={(e) => {
            if (!varsOpen) return
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setVarActive((a) => (a + 1) % variables.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setVarActive((a) => (a - 1 + variables.length) % variables.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const item = variables[varActive]
              if (item) insertVariable(item)
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setVarsOpen(false)
            }
          }}
        >
          <Braces size={14} />
          {t('templates.insertVariable')}
        </button>
        {varsOpen && (
          <div className="var-menu var-menu-dropdown">
            <VariableList
              items={variables}
              active={varActive}
              onPick={insertVariable}
              onHover={setVarActive}
            />
            <div className="var-menu-hint">{t('templates.variableHint')}</div>
          </div>
        )}
      </div>
    </div>
  )
}
