import { type ReactNode, useEffect, useRef } from 'react'
import { Braces } from 'lucide-react'
import type { VariableOption } from '@renderer/lib/variables'
import { t } from '@renderer/lib/i18n'
import { cx } from '@renderer/lib/platform'

/** List of variables used by the "{{" autocomplete and the insert menu. */
export function VariableList({
  items,
  active,
  onPick,
  onHover,
}: {
  items: VariableOption[]
  active: number
  onPick(item: VariableOption): void
  onHover?(index: number): void
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])
  if (items.length === 0) return <div className="var-menu-empty">{t('palette.empty')}</div>
  let lastGroup: string | null = null
  return (
    <div ref={ref} className="var-menu-list" role="listbox">
      {items.map((item, i) => {
        const header =
          item.group !== lastGroup ? (
            <div className="var-menu-group" key={`g-${item.group}`}>
              {item.group === 'base' ? t('templates.variablesBase') : t('templates.variablesExtra')}
            </div>
          ) : null
        lastGroup = item.group
        return [
          header,
          <button
            key={item.key}
            type="button"
            role="option"
            aria-selected={i === active}
            data-active={i === active}
            className={cx('var-menu-item', i === active && 'is-active')}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(item)
            }}
            onMouseEnter={() => onHover?.(i)}
          >
            <Braces size={13} />
            <span className="grow truncate">{item.label}</span>
            <code>{`{{${item.key}}}`}</code>
          </button>,
        ]
      })}
    </div>
  )
}
