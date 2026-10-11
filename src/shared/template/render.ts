/**
 * Template variables: {{nume}}, {{prenume}}, {{email}}, {{telefon}}, {{adresa}}, {{produs}}
 * and any extra spreadsheet column as {{extra.Column}}. A fallback for empty values can be
 * given after a pipe: {{prenume|Client}}.
 */
export const baseVariables = ['nume', 'prenume', 'email', 'telefon', 'adresa', 'produs'] as const
export type BaseVariable = (typeof baseVariables)[number]

export interface TemplateLead {
  name: string
  firstName: string
  email: string
  phone: string
  address: string
  /** Display value for {{produs}}: matched product names, or the raw cell. */
  product: string
  extra: Record<string, string>
}

export interface RenderResult {
  output: string
  /** Variables that rendered empty (no value and no fallback). */
  missing: string[]
  /** Variables that are not known at all (typos, removed columns). */
  unknown: string[]
}

export const VARIABLE_RE = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([^{}]*?)\s*)?\}\}/g

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Undo the entity encoding the rich-text editor applies inside {{...}} (e.g. &amp; in fallbacks). */
function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

export function lookupVariable(name: string, lead: TemplateLead): string | undefined {
  const values: Record<BaseVariable, string> = {
    nume: lead.name,
    prenume: lead.firstName,
    email: lead.email,
    telefon: lead.phone,
    adresa: lead.address,
    produs: lead.product,
  }
  const key = name.trim()
  if ((baseVariables as readonly string[]).includes(key.toLowerCase())) {
    return values[key.toLowerCase() as BaseVariable]
  }
  if (key.toLowerCase().startsWith('extra.')) {
    const column = key.slice('extra.'.length)
    if (column in lead.extra) return lead.extra[column]
    // Column names are matched case-insensitively as a convenience.
    const found = Object.keys(lead.extra).find((k) => k.toLowerCase() === column.toLowerCase())
    return found === undefined ? undefined : lead.extra[found]
  }
  return undefined
}

/** Renders variables in `template`. With `html: true` values are HTML-escaped. */
export function renderTemplate(
  template: string,
  lead: TemplateLead,
  options: { html: boolean; knownExtras?: readonly string[] } = { html: false },
): RenderResult {
  const missing = new Set<string>()
  const unknown = new Set<string>()
  const known = new Set((options.knownExtras ?? []).map((k) => `extra.${k}`.toLowerCase()))
  const output = template.replace(VARIABLE_RE, (_match, rawName: string, rawFallback?: string) => {
    const name = options.html ? decodeEntities(rawName).trim() : rawName.trim()
    const fallback =
      rawFallback === undefined
        ? undefined
        : options.html
          ? decodeEntities(rawFallback)
          : rawFallback
    const value = lookupVariable(name, lead)
    const isKnown =
      value !== undefined ||
      (baseVariables as readonly string[]).includes(name.toLowerCase()) ||
      known.has(name.toLowerCase())
    if (!isKnown) unknown.add(name)
    let result = value?.trim() ? value : ''
    if (!result && fallback !== undefined) result = fallback
    if (!result && isKnown) missing.add(name)
    return options.html ? escapeHtml(result) : result
  })
  return { output, missing: [...missing], unknown: [...unknown] }
}

/** Variables referenced in a template string (names only, deduplicated). */
export function extractVariables(template: string): string[] {
  const names = new Set<string>()
  for (const m of template.matchAll(VARIABLE_RE)) names.add(decodeEntities(m[1]!).trim())
  return [...names]
}
