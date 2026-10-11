import { type ReactNode, useEffect, useState } from 'react'
import { AlertTriangle, Ban, ChevronDown, ChevronRight, Info } from 'lucide-react'
import type { ImportIssue } from '@shared/schemas/import'
import { defaultListName, useImport } from '@renderer/stores/import'
import { useLists } from '@renderer/stores/lists'
import { t, tp } from '@renderer/lib/i18n'
import { Button, Segmented } from '@renderer/components/ui'

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }): ReactNode {
  return (
    <div className="stat">
      <div className="stat-value" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function IssueSection<T extends string>({
  title,
  hint,
  count,
  samples,
  value,
  options,
  onChange,
}: {
  title: string
  hint: string
  count: number
  samples: ImportIssue[]
  value: T
  options: Array<{ value: T; label: string }>
  onChange(value: T): void
}): ReactNode {
  const [open, setOpen] = useState(false)
  if (count === 0) return null
  return (
    <div className="group issue">
      <div className="group-row">
        <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} aria-hidden />
        <div className="group-row-label">
          <div>
            {title} <span className="badge badge-warning">{count}</span>
          </div>
          <div className="subtle">{hint}</div>
        </div>
        <Segmented label={title} value={value} options={options} onChange={onChange} />
      </div>
      <div className="group-row issue-toggle">
        <button
          type="button"
          className="link-btn"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {open ? t('import.hideRows') : t('import.showRows')}
        </button>
      </div>
      {open && (
        <ul className="issue-list selectable">
          {samples.map((s) => (
            <li key={s.row}>
              <span className="subtle tabular">{t('import.rowLabel', { row: s.row })}</span>
              <span className="truncate">{s.name || '—'}</span>
              <span className="truncate mono">{s.email || '—'}</span>
            </li>
          ))}
          {count > samples.length && (
            <li className="subtle">{t('import.moreRows', { count: count - samples.length })}</li>
          )}
        </ul>
      )}
    </div>
  )
}

export function ReviewStep(): ReactNode {
  const { file, report, decisions, setDecisions, target, setTarget, commit, back, busy } =
    useImport()
  const { lists, load } = useLists()

  useEffect(() => {
    void load()
  }, [load])

  if (!report) return null

  const willImport =
    report.readyRows +
    (decisions.invalid === 'import' ? report.invalid.count : 0) +
    (decisions.fileDuplicates === 'import' ? report.fileDuplicates.count : 0) +
    (decisions.dbDuplicates !== 'skip' ? report.dbDuplicates.count : 0)
  const targetValid = target.kind === 'new' ? target.name.trim().length > 0 : target.listId !== null

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h2 className="section-title">{t('import.reviewTitle')}</h2>

      <div className="stats">
        <Stat value={report.totalRows - report.emptyRows} label={t('import.statTotal')} />
        <Stat value={report.readyRows} label={t('import.statReady')} tone="success" />
        <Stat
          value={report.invalid.count}
          label={t('import.statInvalid')}
          tone={report.invalid.count ? 'warning' : undefined}
        />
        <Stat
          value={report.fileDuplicates.count}
          label={t('import.statFileDup')}
          tone={report.fileDuplicates.count ? 'warning' : undefined}
        />
        <Stat
          value={report.dbDuplicates.count}
          label={t('import.statDbDup')}
          tone={report.dbDuplicates.count ? 'warning' : undefined}
        />
      </div>

      <IssueSection
        title={t('import.invalidTitle')}
        hint={t('import.invalidHint')}
        count={report.invalid.count}
        samples={report.invalid.samples}
        value={decisions.invalid}
        onChange={(invalid) => setDecisions({ invalid })}
        options={[
          { value: 'skip', label: t('import.decisionSkip') },
          { value: 'import', label: t('import.decisionImport') },
        ]}
      />
      <IssueSection
        title={t('import.fileDupTitle')}
        hint={t('import.fileDupHint')}
        count={report.fileDuplicates.count}
        samples={report.fileDuplicates.samples}
        value={decisions.fileDuplicates}
        onChange={(fileDuplicates) => setDecisions({ fileDuplicates })}
        options={[
          { value: 'skip', label: t('import.decisionSkip') },
          { value: 'import', label: t('import.decisionImport') },
        ]}
      />
      <IssueSection
        title={t('import.dbDupTitle')}
        hint={t('import.dbDupHint')}
        count={report.dbDuplicates.count}
        samples={report.dbDuplicates.samples}
        value={decisions.dbDuplicates}
        onChange={(dbDuplicates) => setDecisions({ dbDuplicates })}
        options={[
          { value: 'skip', label: t('import.decisionSkip') },
          { value: 'update', label: t('import.decisionUpdate') },
          { value: 'import', label: t('import.decisionImport') },
        ]}
      />

      {report.doNotContact > 0 && (
        <div className="callout">
          <Ban size={16} />
          <span>{tp('import.dncNotice', report.doNotContact)}</span>
        </div>
      )}
      {report.emptyRows > 0 && (
        <div className="callout">
          <Info size={16} />
          <span>
            {t('import.emptyNotice')} ({report.emptyRows})
          </span>
        </div>
      )}

      <div>
        <h3 className="section-subtitle" style={{ marginBottom: 8 }}>
          {t('import.targetTitle')}
        </h3>
        <div className="group">
          <div className="group-row">
            <Segmented
              label={t('import.targetTitle')}
              value={target.kind}
              onChange={(kind) =>
                setTarget(
                  kind === 'new'
                    ? { kind: 'new', name: defaultListName(file?.fileName ?? '') }
                    : { kind: 'existing', listId: lists[0]?.id ?? null },
                )
              }
              options={[
                { value: 'new', label: t('import.targetNew') },
                ...(lists.length
                  ? [{ value: 'existing' as const, label: t('import.targetExisting') }]
                  : []),
              ]}
            />
            {target.kind === 'new' ? (
              <input
                className="input grow"
                aria-label={t('import.listName')}
                placeholder={t('import.listName')}
                value={target.name}
                onChange={(e) => setTarget({ kind: 'new', name: e.target.value })}
              />
            ) : (
              <select
                className="select grow"
                aria-label={t('import.targetExisting')}
                value={target.listId ?? ''}
                onChange={(e) => setTarget({ kind: 'existing', listId: Number(e.target.value) })}
              >
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.leadCount})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="row-between">
        <Button onClick={back}>{t('common.back')}</Button>
        <Button
          variant="primary"
          disabled={willImport === 0 || !targetValid}
          loading={busy}
          onClick={() => void commit()}
          data-testid="import-commit"
        >
          {willImport === 0 ? t('import.commitNothing') : tp('import.commit', willImport)}
        </Button>
      </div>
    </div>
  )
}
