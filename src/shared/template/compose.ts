import { renderTemplate, type TemplateLead } from './render'

export interface ComposeInput {
  subject: string
  bodyHtml: string
  signatureHtml?: string
  unsubscribeHtml?: string | null
  knownExtras?: readonly string[]
}

export interface ComposedEmail {
  subject: string
  html: string
  missing: string[]
  unknown: string[]
}

const WRAPPER_STYLE =
  "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#1d1d1f"

function isEmptyHtml(html: string | undefined | null): boolean {
  return (
    !html ||
    !html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, '')
      .trim()
  )
}

/**
 * Builds the final email: subject and body with variables replaced, then the signature and
 * the optional unsubscribe footer, wrapped in a minimal HTML document with inline styles.
 */
export function composeEmail(input: ComposeInput, lead: TemplateLead): ComposedEmail {
  const opts = { knownExtras: input.knownExtras }
  const subject = renderTemplate(input.subject, lead, { html: false, ...opts })
  const body = renderTemplate(input.bodyHtml, lead, { html: true, ...opts })
  const signature = isEmptyHtml(input.signatureHtml)
    ? null
    : renderTemplate(input.signatureHtml!, lead, { html: true, ...opts })

  const parts = [body.output]
  if (signature)
    parts.push(`<div class="signature" style="margin-top:20px">${signature.output}</div>`)
  if (!isEmptyHtml(input.unsubscribeHtml)) {
    parts.push(
      `<div class="unsubscribe" style="margin-top:28px;padding-top:12px;border-top:1px solid #e5e5ea">${input.unsubscribeHtml}</div>`,
    )
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0"><div style="${WRAPPER_STYLE}">${parts.join('')}</div></body></html>`

  const unique = (lists: string[][]): string[] => [...new Set(lists.flat())]
  return {
    subject: subject.output.replace(/\s+/g, ' ').trim(),
    html,
    missing: unique([subject.missing, body.missing, signature?.missing ?? []]),
    unknown: unique([subject.unknown, body.unknown, signature?.unknown ?? []]),
  }
}
