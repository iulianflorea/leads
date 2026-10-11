import { normalizeEmail } from '../matching/normalize'

// Pragmatic address check: local@domain.tld, no spaces, a dot in the domain.
const EMAIL_RE = /^[^\s@"<>(),;:]+@[^\s@"<>(),;:]+\.[a-z]{2,}$/i

export function isValidEmail(email: string): boolean {
  const value = email.trim()
  return value.length <= 254 && EMAIL_RE.test(value)
}

/** Some sheets put "Name <a@b.ro>" or "mailto:" in the cell; extract the bare address. */
export function cleanEmail(raw: string): string {
  let value = raw.trim().replace(/^mailto:/i, '')
  const angle = /<([^>]+)>/.exec(value)
  if (angle) value = angle[1]!.trim()
  return value
}

/** Splits a product cell on , ; / and newlines into distinct values. */
export function splitProducts(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;/\n|]+/)) {
    const value = part.trim()
    const key = value.toLowerCase()
    if (value && !seen.has(key)) {
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

/** First word of a full name, used for {{prenume}} when no first-name column exists. */
export function deriveFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

export { normalizeEmail }
