import { targetFields, type ColumnMapping } from './fields'
import { cleanEmail, deriveFirstName, isValidEmail, normalizeEmail } from './validate'

export interface MappedRow {
  /** 1-based spreadsheet row number. */
  row: number
  name: string
  firstName: string
  email: string
  emailNorm: string
  phone: string
  address: string
  product: string
  extra: Record<string, string>
}

export type RowCategory = 'empty' | 'invalid' | 'fileDuplicate' | 'dbDuplicate' | 'ok'

export interface ClassifiedRow {
  data: MappedRow
  category: RowCategory
}

/**
 * Converts raw sheet rows to lead fields. Unmapped columns with a value go to `extra`.
 * `firstRow` is the spreadsheet row number of rows[0].
 */
export function mapRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
  firstRow: number,
): MappedRow[] {
  const index = new Map(headers.map((h, i) => [h, i]))
  const mappedHeaders = new Set(targetFields.map((f) => mapping[f]).filter(Boolean))
  const cell = (row: string[], header: string | null): string =>
    header !== null && index.has(header) ? String(row[index.get(header)!] ?? '').trim() : ''

  return rows.map((row, i) => {
    const extra: Record<string, string> = {}
    headers.forEach((h, col) => {
      if (mappedHeaders.has(h)) return
      const v = String(row[col] ?? '').trim()
      if (v) extra[h] = v
    })
    const name = cell(row, mapping.name)
    const email = cleanEmail(cell(row, mapping.email))
    return {
      row: firstRow + i,
      name,
      firstName: cell(row, mapping.firstName) || deriveFirstName(name),
      email,
      emailNorm: normalizeEmail(email),
      phone: cell(row, mapping.phone),
      address: cell(row, mapping.address),
      product: cell(row, mapping.product),
      extra,
    }
  })
}

function isEmpty(raw: string[]): boolean {
  return raw.every((v) => !String(v ?? '').trim())
}

/**
 * Assigns each row a single category, in order of precedence:
 * empty > invalid email > duplicate within the file > already in the database > ok.
 */
export function classifyRows(
  mapped: MappedRow[],
  rawRows: string[][],
  existingEmails: ReadonlySet<string>,
): ClassifiedRow[] {
  const seen = new Set<string>()
  return mapped.map((data, i) => {
    if (isEmpty(rawRows[i] ?? [])) return { data, category: 'empty' }
    if (!isValidEmail(data.email)) return { data, category: 'invalid' }
    if (seen.has(data.emailNorm)) return { data, category: 'fileDuplicate' }
    seen.add(data.emailNorm)
    if (existingEmails.has(data.emailNorm)) return { data, category: 'dbDuplicate' }
    return { data, category: 'ok' }
  })
}
