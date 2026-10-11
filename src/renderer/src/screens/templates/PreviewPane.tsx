import { type ReactNode, useEffect, useState } from 'react'
import type { EmailPreview as Preview, TemplateSource } from '@shared/schemas/template'
import { call } from '@renderer/lib/api'
import { t } from '@renderer/lib/i18n'
import { useTemplates } from '@renderer/stores/templates'
import { EmailPreview } from '@renderer/components/EmailPreview'
import { LeadPicker } from '@renderer/components/LeadPicker'
import { Segmented, Skeleton } from '@renderer/components/ui'

export function PreviewPane({
  source,
  footer,
}: {
  source: TemplateSource | null
  footer?: ReactNode
}): ReactNode {
  const { previewLead, setPreviewLead } = useTemplates()
  const [dark, setDark] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const key = JSON.stringify(source)

  useEffect(() => {
    if (!source) return
    let cancelled = false
    const id = setTimeout(() => {
      call('templates:preview', { source, leadId: previewLead?.id ?? null })
        .then((p) => !cancelled && setPreview(p))
        .catch(() => {
          // The selected lead may have been deleted; fall back to sample data.
          if (!cancelled && previewLead) setPreviewLead(null)
        })
    }, 220)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, previewLead])

  return (
    <aside className="preview-pane" aria-label={t('templates.preview')}>
      <div className="row-between preview-head">
        <h2 className="section-subtitle">{t('templates.preview')}</h2>
        <Segmented
          label={t('templates.preview')}
          value={dark ? 'dark' : 'light'}
          onChange={(v) => setDark(v === 'dark')}
          options={[
            { value: 'light', label: t('templates.light') },
            { value: 'dark', label: t('templates.dark') },
          ]}
        />
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="subtle">{t('templates.previewLead')}</span>
        <LeadPicker value={previewLead} onChange={setPreviewLead} />
      </div>
      <div className="preview-body" data-testid="template-preview">
        {preview ? (
          <EmailPreview preview={preview} dark={dark} />
        ) : (
          <div className="stack">
            <Skeleton height={60} />
            <Skeleton height={220} />
          </div>
        )}
      </div>
      {footer}
    </aside>
  )
}
