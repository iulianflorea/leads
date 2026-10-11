import { type ReactNode, useState } from 'react'
import { X } from 'lucide-react'
import { t } from '@renderer/lib/i18n'

/** Free-text tags: Enter or comma adds, Backspace on empty input removes the last one. */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id?: string
  value: string[]
  onChange(value: string[]): void
  placeholder?: string
}): ReactNode {
  const [draft, setDraft] = useState('')
  const add = (raw: string): void => {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const lower = new Set(value.map((v) => v.toLowerCase()))
    const next = [...value]
    for (const item of items) {
      if (!lower.has(item.toLowerCase())) {
        next.push(item)
        lower.add(item.toLowerCase())
      }
    }
    onChange(next)
    setDraft('')
  }
  return (
    <div
      className="tag-input"
      onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
    >
      {value.map((tag) => (
        <span key={tag} className="tag">
          {tag}
          <button
            type="button"
            aria-label={`${t('common.delete')} ${tag}`}
            onClick={() => onChange(value.filter((v) => v !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length ? '' : placeholder}
        onChange={(e) => {
          if (e.target.value.endsWith(',')) add(e.target.value)
          else setDraft(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && draft.trim()) {
            e.preventDefault()
            add(draft)
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
      />
    </div>
  )
}
