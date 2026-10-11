import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import * as XLSX from 'xlsx'
import { AppError } from '@shared/errors'
import { t } from '@shared/i18n'

export const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'csv']

export interface ParsedSheet {
  headers: string[]
  rows: string[][]
  /** Spreadsheet row number (1-based) of rows[0]. */
  firstRow: number
}

export interface OpenedWorkbook {
  fileName: string
  workbook: XLSX.WorkBook
}

export function openWorkbook(path: string): OpenedWorkbook {
  const ext = extname(path).slice(1).toLowerCase()
  if (!SUPPORTED_EXTENSIONS.includes(ext)) throw new AppError('fileUnsupported', ext)
  let workbook: XLSX.WorkBook
  try {
    const data = readFileSync(path)
    workbook = XLSX.read(data, {
      type: 'buffer',
      cellDates: true,
      dense: true,
      // CSV exported by Excel is often UTF-8 with BOM; SheetJS detects it.
      codepage: 65001,
    })
  } catch (cause) {
    throw new AppError('fileUnreadable', basename(path), { cause })
  }
  return { fileName: basename(path), workbook }
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}

/** Makes headers unique and non-empty ("Coloana 3", "Email (2)"). */
export function normalizeHeaders(raw: string[]): string[] {
  const counts = new Map<string, number>()
  return raw.map((h, i) => {
    const base = h.trim() || t('import.unnamedColumn', { n: i + 1 })
    const n = (counts.get(base) ?? 0) + 1
    counts.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

/** The header row is the first row with any non-empty cell. */
export function parseSheet(workbook: XLSX.WorkBook, sheetName: string): ParsedSheet {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new AppError('notFound', 'sheet')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: true,
    dateNF: 'yyyy-mm-dd',
  })
  const rows = matrix.map((r) => (Array.isArray(r) ? r.map(cellText) : []))
  const headerIndex = rows.findIndex((r) => r.some((c) => c !== ''))
  if (headerIndex === -1) return { headers: [], rows: [], firstRow: 1 }

  const headerRow = rows[headerIndex]!
  const width = Math.max(headerRow.length, ...rows.slice(headerIndex + 1).map((r) => r.length))
  const rawHeaders = Array.from({ length: width }, (_, i) => headerRow[i] ?? '')
  // Drop trailing columns that have neither a header nor any data.
  let lastUsed = width - 1
  const body = rows.slice(headerIndex + 1)
  while (lastUsed >= 0 && !rawHeaders[lastUsed] && body.every((r) => !r[lastUsed])) lastUsed--
  const headers = normalizeHeaders(rawHeaders.slice(0, lastUsed + 1))

  // Trim trailing blank rows.
  let end = body.length
  while (end > 0 && body[end - 1]!.every((c) => c === '')) end--

  return {
    headers,
    rows: body.slice(0, end).map((r) => headers.map((_, i) => r[i] ?? '')),
    firstRow: headerIndex + 2,
  }
}

export function sheetSummaries(workbook: XLSX.WorkBook): Array<{ name: string; rowCount: number }> {
  return workbook.SheetNames.map((name) => {
    const ref = workbook.Sheets[name]?.['!ref']
    const rowCount = ref ? XLSX.utils.decode_range(ref).e.r : 0
    return { name, rowCount }
  })
}
