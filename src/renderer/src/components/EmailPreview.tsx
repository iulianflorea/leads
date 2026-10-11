import { type ReactNode, useEffect, useRef, useState } from 'react'
import { AlertTriangle, FileText, Paperclip } from 'lucide-react'
import type { EmailPreview as Preview } from '@shared/schemas/template'
import { t } from '@renderer/lib/i18n'
import { formatBytes } from '@renderer/lib/format'

const DARK_STYLE = `<style>
  html, body { background: #1c1c1e !important; }
  body > div { color: #e8e8ed !important; }
  a { color: #64a8ff !important; }
  .unsubscribe { border-color: #3a3a3c !important; }
</style>`

/** Renders an email preview in an isolated iframe (no scripts), with header, attachments and warnings. */
export function EmailPreview({ preview, dark }: { preview: Preview; dark: boolean }): ReactNode {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(240)
  const srcDoc = dark ? preview.html.replace('</head>', `${DARK_STYLE}</head>`) : preview.html

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = (): void => {
      const doc = el.contentDocument
      if (doc?.body) setHeight(Math.max(160, doc.documentElement.scrollHeight + 4))
    }
    el.addEventListener('load', measure)
    return () => el.removeEventListener('load', measure)
  }, [srcDoc])

  return (
    <div className="stack" style={{ gap: 10 }}>
      {!preview.emailValid && (
        <div className="callout callout-danger">
          <AlertTriangle size={15} />
          <span>{t('templates.invalidEmail')}</span>
        </div>
      )}
      {preview.unknown.length > 0 && (
        <div className="callout callout-danger" role="alert">
          <AlertTriangle size={15} />
          <span>
            {t('templates.unknownVars', {
              vars: preview.unknown.map((v) => `{{${v}}}`).join(', '),
            })}
          </span>
        </div>
      )}
      {preview.missing.length > 0 && (
        <div className="callout callout-warning" role="alert">
          <AlertTriangle size={15} />
          <span>
            {t('templates.missingVars', {
              vars: preview.missing.map((v) => `{{${v}}}`).join(', '),
            })}
          </span>
        </div>
      )}
      {preview.unresolvedProducts.length > 0 && (
        <div className="callout callout-warning">
          <AlertTriangle size={15} />
          <span>
            {t('templates.unresolvedProducts', { products: preview.unresolvedProducts.join(', ') })}
          </span>
        </div>
      )}

      <div className={`mail-card ${dark ? 'mail-dark' : ''}`}>
        <dl className="mail-head selectable">
          <div>
            <dt>{t('templates.to')}</dt>
            <dd className="truncate">
              {preview.toName ? `${preview.toName} <${preview.to}>` : preview.to}
            </dd>
          </div>
          <div>
            <dt>{t('templates.subjectLabel')}</dt>
            <dd className="mail-subject">{preview.subject || '—'}</dd>
          </div>
        </dl>
        <iframe
          ref={frame}
          title={t('templates.preview')}
          className="mail-frame"
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          style={{ height }}
        />
        <div className="mail-attachments">
          <Paperclip size={13} />
          {preview.attachments.length === 0 ? (
            <span className="subtle">{t('templates.noAttachments')}</span>
          ) : (
            preview.attachments.map((a) => (
              <span key={a.productId} className="attachment-chip" title={a.name}>
                <FileText size={13} />
                <span className="truncate">{a.name}</span>
                <span className="subtle">{formatBytes(a.size)}</span>
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
