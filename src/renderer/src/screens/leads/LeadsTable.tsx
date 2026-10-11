import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { LeadPatch, LeadRow, LeadSort } from '@shared/schemas/lead'
import { useLeads } from '@renderer/stores/leads'
import { call } from '@renderer/lib/api'
import { toast } from '@renderer/stores/toast'
import { t } from '@renderer/lib/i18n'
import { cx, isModEvent } from '@renderer/lib/platform'
import { PdfIndicator, StatusBadge } from './badges'

const ROW_HEIGHT = 40

type EditableKey = 'name' | 'email' | 'phone' | 'productRaw'

interface Column {
  key: string
  label: string
  sort?: LeadSort
  editable?: EditableKey
  render(row: LeadRow): ReactNode
}

const columns: Column[] = [
  {
    key: 'name',
    label: t('fields.name'),
    sort: 'name',
    editable: 'name',
    render: (r) => r.name || '—',
  },
  {
    key: 'email',
    label: t('fields.email'),
    sort: 'email',
    editable: 'email',
    render: (r) =>
      r.email ? (
        <span
          className={cx(!r.emailValid && 'text-danger')}
          title={!r.emailValid ? t('leads.invalidEmail') : undefined}
        >
          {r.email}
        </span>
      ) : (
        <span className="text-danger">{t('leads.invalidEmail')}</span>
      ),
  },
  { key: 'phone', label: t('fields.phone'), editable: 'phone', render: (r) => r.phone },
  {
    key: 'product',
    label: t('fields.product'),
    sort: 'product',
    editable: 'productRaw',
    render: (r) => r.productRaw,
  },
  {
    key: 'list',
    label: t('fields.list'),
    sort: 'list',
    render: (r) => <span className="muted">{r.listName ?? ''}</span>,
  },
  {
    key: 'status',
    label: t('fields.status'),
    sort: 'status',
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'pdf',
    label: t('fields.pdf'),
    render: (r) => <PdfIndicator state={r.pdfState} count={r.attachmentCount} />,
  },
]

function InlineEditor({
  initial,
  onDone,
}: {
  initial: string
  onDone(value: string | null): void
}): ReactNode {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="input cell-input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') onDone(value)
        if (e.key === 'Escape') onDone(null)
      }}
      onBlur={() => onDone(value)}
    />
  )
}

export function LeadsTable({ onDelete }: { onDelete(ids: number[]): void }): ReactNode {
  const { rows, sort, direction, selected, setSort, toggle, selectRange, open, openId } = useLeads()
  const parentRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const [editing, setEditing] = useState<{ id: number; key: EditableKey } | null>(null)
  const lastClicked = useRef<number | null>(null)

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  useEffect(() => {
    if (active >= rows.length) setActive(Math.max(0, rows.length - 1))
  }, [rows.length, active])

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someSelected = !allSelected && rows.some((r) => selected.has(r.id))

  const saveEdit = async (row: LeadRow, key: EditableKey, value: string | null): Promise<void> => {
    setEditing(null)
    parentRef.current?.focus()
    if (value === null || value.trim() === String(row[key]).trim()) return
    try {
      const patch: LeadPatch = { [key]: value.trim() }
      await call('leads:update', { id: row.id, patch })
    } catch (error) {
      toast.error(error)
    }
  }

  const onRowClick = (e: MouseEvent, index: number, row: LeadRow): void => {
    setActive(index)
    if (e.shiftKey && lastClicked.current !== null) {
      const [a, b] = [lastClicked.current, index].sort((x, y) => x - y)
      selectRange(
        rows.slice(a, b! + 1).map((r) => r.id),
        true,
      )
      return
    }
    if (isModEvent(e)) {
      toggle(row.id)
      lastClicked.current = index
      return
    }
    lastClicked.current = index
    open(row.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (editing || rows.length === 0) return
    const move = (to: number): void => {
      const next = Math.max(0, Math.min(rows.length - 1, to))
      setActive(next)
      virtualizer.scrollToIndex(next, { align: 'auto' })
      if (e.shiftKey) toggle(rows[next]!.id, true)
    }
    const row = rows[active]
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(active + 1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(active - 1)
        break
      case 'Home':
        e.preventDefault()
        move(0)
        break
      case 'End':
        e.preventDefault()
        move(rows.length - 1)
        break
      case ' ':
        e.preventDefault()
        if (row) toggle(row.id)
        break
      case 'Enter':
        e.preventDefault()
        if (row) open(row.id)
        break
      case 'F2':
        e.preventDefault()
        if (row) setEditing({ id: row.id, key: 'name' })
        break
      case 'Delete':
      case 'Backspace': {
        e.preventDefault()
        const ids = selected.size ? [...selected] : row ? [row.id] : []
        if (ids.length) onDelete(ids)
        break
      }
      case 'a':
        if (isModEvent(e)) {
          e.preventDefault()
          selectRange(
            rows.map((r) => r.id),
            !allSelected,
          )
        }
        break
    }
  }

  return (
    <div className="table" role="grid" aria-rowcount={rows.length + 1} aria-multiselectable>
      <div className="table-head" role="row">
        <div className="cell cell-check" role="columnheader">
          <input
            type="checkbox"
            className="checkbox"
            aria-label={t('common.all')}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected
            }}
            onChange={() =>
              selectRange(
                rows.map((r) => r.id),
                !allSelected,
              )
            }
          />
        </div>
        {columns.map((c) => (
          <div
            key={c.key}
            className={cx('cell', `col-${c.key}`)}
            role="columnheader"
            aria-sort={
              c.sort && sort === c.sort
                ? direction === 'asc'
                  ? 'ascending'
                  : 'descending'
                : undefined
            }
          >
            {c.sort ? (
              <button type="button" className="sort-btn" onClick={() => setSort(c.sort!)}>
                {c.label}
                {sort === c.sort &&
                  (direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
              </button>
            ) : (
              c.label
            )}
          </div>
        ))}
      </div>
      <div
        ref={parentRef}
        className="table-body"
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-activedescendant={rows[active] ? `lead-row-${rows[active].id}` : undefined}
        data-testid="leads-table"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index]!
            const isSelected = selected.has(row.id)
            return (
              <div
                key={row.id}
                id={`lead-row-${row.id}`}
                role="row"
                aria-selected={isSelected}
                className={cx(
                  'table-row',
                  isSelected && 'is-selected',
                  v.index === active && 'is-active',
                  openId === row.id && 'is-open',
                )}
                style={{ transform: `translateY(${v.start}px)`, height: ROW_HEIGHT }}
                onClick={(e) => onRowClick(e, v.index, row)}
              >
                <div
                  className="cell cell-check"
                  role="gridcell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    tabIndex={-1}
                    aria-label={row.name || row.email}
                    checked={isSelected}
                    onChange={() => toggle(row.id)}
                  />
                </div>
                {columns.map((c) => {
                  const isEditing = editing?.id === row.id && editing.key === c.editable
                  return (
                    <div
                      key={c.key}
                      role="gridcell"
                      className={cx('cell', `col-${c.key}`, c.editable && 'cell-editable')}
                      title={c.editable && !isEditing ? t('leads.editHint') : undefined}
                      onDoubleClick={(e) => {
                        if (!c.editable) return
                        e.stopPropagation()
                        setEditing({ id: row.id, key: c.editable })
                      }}
                    >
                      {isEditing && c.editable ? (
                        <InlineEditor
                          initial={String(row[c.editable])}
                          onDone={(value) => void saveEdit(row, c.editable!, value)}
                        />
                      ) : (
                        <div className="truncate">{c.render(row)}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
