import { type ReactNode, useMemo, useRef, useState } from 'react'
import { filterVariables, type VariableOption } from '@renderer/lib/variables'
import { VariableList } from './VariableMenu'

/** Single-line input with "{{" variable autocomplete (used for the subject). */
export function VariableInput({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id?: string
  value: string
  onChange(value: string): void
  options: VariableOption[]
  placeholder?: string
}): ReactNode {
  const ref = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const items = useMemo(
    () => (query === null ? [] : filterVariables(options, query)),
    [options, query],
  )

  const detect = (el: HTMLInputElement): void => {
    const before = el.value.slice(0, el.selectionStart ?? el.value.length)
    const m = /\{\{([^{}]*)$/.exec(before)
    setQuery(m ? m[1]! : null)
    setActive(0)
  }

  const pick = (item: VariableOption): void => {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart ?? value.length
    const before = value.slice(0, caret).replace(/\{\{[^{}]*$/, '')
    const after = value.slice(caret).replace(/^[^{}\s]*\}\}/, '')
    const insert = `{{${item.key}}}`
    onChange(before + insert + after)
    setQuery(null)
    requestAnimationFrame(() => {
      const pos = before.length + insert.length
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="var-input">
      <input
        ref={ref}
        id={id}
        className="input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={query !== null}
        onChange={(e) => {
          onChange(e.target.value)
          detect(e.target)
        }}
        onClick={(e) => detect(e.currentTarget)}
        onBlur={() => setQuery(null)}
        onKeyDown={(e) => {
          if (query === null || items.length === 0) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => (a + 1) % items.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a - 1 + items.length) % items.length)
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault()
            pick(items[active]!)
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            setQuery(null)
          }
        }}
      />
      {query !== null && (
        <div className="var-menu var-menu-input">
          <VariableList items={items} active={active} onPick={pick} onHover={setActive} />
        </div>
      )}
    </div>
  )
}
