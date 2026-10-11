import { type ReactNode, useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, UserRound } from 'lucide-react'
import type { LeadRow } from '@shared/schemas/lead'
import { call } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'

/** Searchable lead selector; `null` means "sample data". */
export function LeadPicker({
  value,
  onChange,
  allowSample = true,
}: {
  value: { id: number; label: string } | null
  onChange(value: { id: number; label: string } | null): void
  allowSample?: boolean
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<LeadRow[]>([])
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const id = setTimeout(() => {
      call('leads:query', { search: query, sort: 'name', direction: 'asc' })
        .then((r) => !cancelled && setRows(r.slice(0, 40)))
        .catch(() => undefined)
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [open, query])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const options: Array<{ id: number; label: string; sub: string } | null> = [
    ...(allowSample ? [null] : []),
    ...rows.map((r) => ({ id: r.id, label: r.name || r.email, sub: r.email })),
  ]
  const choose = (o: (typeof options)[number]): void => {
    onChange(o ? { id: o.id, label: o.label } : null)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="lead-picker" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-sm lead-picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(0)
          setOpen(!open)
        }}
      >
        <UserRound size={13} />
        <span className="truncate">{value?.label ?? t('templates.previewSample')}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="picker-pop">
          <div className="input-with-icon">
            <Search size={13} />
            <input
              className="input"
              autoFocus
              placeholder={t('templates.previewSearch')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActive((a) => Math.min(a + 1, options.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActive((a) => Math.max(a - 1, 0))
                } else if (e.key === 'Enter') {
                  e.preventDefault()
                  if (options[active] !== undefined) choose(options[active]!)
                } else if (e.key === 'Escape') {
                  e.stopPropagation()
                  setOpen(false)
                }
              }}
            />
          </div>
          <ul className="picker-list" role="listbox">
            {options.map((o, i) => (
              <li
                key={o?.id ?? 'sample'}
                role="option"
                aria-selected={i === active}
                className={cx(i === active && 'is-active')}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(o)
                }}
              >
                {o ? (
                  <>
                    <span className="truncate">{o.label}</span>
                    <span className="subtle truncate">{o.sub}</span>
                  </>
                ) : (
                  <span className="muted">{t('templates.previewSample')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
