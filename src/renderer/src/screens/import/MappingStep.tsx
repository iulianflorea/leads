import { type ReactNode, useMemo } from 'react'
import { ArrowRight, Info, Sparkles } from 'lucide-react'
import { targetFields, type TargetField } from '@shared/import/fields'
import { useImport } from '@renderer/stores/import'
import { t, type MessageKey } from '@renderer/lib/i18n'
import { Badge, Button } from '@renderer/components/ui'
import { cx } from '@renderer/lib/platform'

export function MappingStep(): ReactNode {
  const { preview, mapping, setMapping, toReview, back, busy } = useImport()

  const fieldByHeader = useMemo(() => {
    const m = new Map<string, TargetField>()
    if (mapping) for (const f of targetFields) if (mapping[f]) m.set(mapping[f], f)
    return m
  }, [mapping])

  if (!preview || !mapping) return null
  if (preview.headers.length === 0) {
    return (
      <div className="stack">
        <div className="callout callout-warning">
          <Info size={16} />
          <span>{t('import.emptySheet')}</span>
        </div>
        <div>
          <Button onClick={back}>{t('common.back')}</Button>
        </div>
      </div>
    )
  }

  const sample = (header: string | null): string => {
    if (!header) return ''
    const i = preview.headers.indexOf(header)
    return preview.rows.map((r) => r[i] ?? '').find((v) => v.trim()) ?? ''
  }
  const extras = preview.headers.filter((h) => !fieldByHeader.has(h))

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <h2 className="section-title">{t('import.mappingTitle')}</h2>
        <p className="muted">
          {preview.mappingSource === 'saved' ? t('import.mappingSaved') : t('import.mappingHint')}
        </p>
      </div>

      <div className="group">
        {targetFields.map((field) => {
          const header = mapping[field]
          const example = sample(header)
          return (
            <div className="group-row mapping-row" key={field}>
              <div className="group-row-label">
                <label htmlFor={`map-${field}`}>
                  {t(`fields.${field}` as MessageKey)}
                  {field === 'email' && <span className="required"> *</span>}
                </label>
                <div className="subtle">{t(`fieldHints.${field}` as MessageKey)}</div>
              </div>
              <ArrowRight size={14} className="muted" aria-hidden />
              <div className="mapping-select">
                <select
                  id={`map-${field}`}
                  className="select"
                  value={header ?? ''}
                  aria-invalid={field === 'email' && !header ? true : undefined}
                  onChange={(e) => {
                    const value = e.target.value || null
                    const next = { ...mapping }
                    // A column maps to at most one field.
                    if (value) for (const f of targetFields) if (next[f] === value) next[f] = null
                    next[field] = value
                    setMapping(next)
                  }}
                >
                  <option value="">{t('import.noColumn')}</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                <div className="subtle truncate mapping-example">
                  {example ? t('import.example', { value: example }) : ' '}
                </div>
              </div>
              {header && preview.mappingSource === 'auto' && preview.mapping[field] === header ? (
                <span title={t('import.mappingAuto')} className="mapping-auto">
                  <Sparkles size={14} aria-label={t('import.mappingAuto')} />
                </span>
              ) : (
                <span className="mapping-auto" />
              )}
            </div>
          )
        })}
      </div>

      {!mapping.email && (
        <div className="callout callout-warning" role="alert">
          <Info size={16} />
          <span>{t('import.emailRequired')}</span>
        </div>
      )}

      {extras.length > 0 && (
        <div className="callout">
          <Info size={16} />
          <div>
            {t('import.extraColumns')}{' '}
            {extras.map((h) => (
              <code key={h} className="var-chip">{`{{extra.${h}}}`}</code>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="row-between" style={{ marginBottom: 8 }}>
          <h3 className="section-subtitle">{t('import.previewTitle')}</h3>
          <span className="subtle">
            {t('import.previewRows', {
              shown: Math.min(preview.rows.length, 8),
              total: preview.totalRows,
            })}
          </span>
        </div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                {preview.headers.map((h) => {
                  const f = fieldByHeader.get(h)
                  return (
                    <th key={h} className={cx(f && 'mapped')}>
                      <div className="truncate">{h}</div>
                      {f ? (
                        <Badge tone="accent">{t(`fields.${f}` as MessageKey)}</Badge>
                      ) : (
                        <Badge>extra</Badge>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {preview.rows.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  {preview.headers.map((h, j) => (
                    <td key={h} className={cx(fieldByHeader.has(h) && 'mapped')}>
                      <div className="truncate">{r[j]}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="row-between">
        <Button onClick={back}>{t('common.back')}</Button>
        <Button
          variant="primary"
          disabled={!mapping.email}
          loading={busy}
          onClick={() => void toReview()}
          data-testid="mapping-continue"
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  )
}
