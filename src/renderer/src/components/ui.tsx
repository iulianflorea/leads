import { type ReactNode, type ButtonHTMLAttributes, type CSSProperties, useId } from 'react'
import { cx } from '@renderer/lib/platform'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'

export function Button({
  variant = 'secondary',
  size,
  icon,
  loading,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'lg'
  icon?: ReactNode
  loading?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      className={cx(
        'btn',
        `btn-${variant}`,
        size && `btn-${size}`,
        !children && !!icon && 'icon-btn',
        className,
      )}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: (id: string) => ReactNode
}): ReactNode {
  const id = useId()
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange(value: boolean): void
  label: string
  disabled?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange(value: T): void
  label: string
}): ReactNode {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({
  tone,
  children,
}: {
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  children: ReactNode
}): ReactNode {
  return <span className={cx('badge', tone && `badge-${tone}`)}>{children}</span>
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}): ReactNode {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden>
        {icon}
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}

export function Skeleton({
  width = '100%',
  height = 14,
  style,
}: {
  width?: number | string
  height?: number | string
  style?: CSSProperties
}): ReactNode {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden />
}

export function SkeletonRows({ rows = 6 }: { rows?: number }): ReactNode {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={28} width={`${92 - ((i * 7) % 30)}%`} />
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return <kbd className="kbd">{children}</kbd>
}
