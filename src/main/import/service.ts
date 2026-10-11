import { randomUUID } from 'node:crypto'
import type { ColumnMapping } from '@shared/import/fields'
import { applySavedMapping, detectColumns, headerSignature } from '@shared/import/detect'
import { classifyRows, mapRows, type ClassifiedRow } from '@shared/import/classify'
import type {
  ImportCommitInput,
  ImportDecisions,
  ImportFileInfo,
  ImportIssue,
  ImportReport,
  ImportResult,
  SheetPreview,
} from '@shared/schemas/import'
import { AppError } from '@shared/errors'
import { targetFields } from '@shared/import/fields'
import type { DB } from '../db/connection'
import type { LeadsRepo } from '../repos/leads'
import type { ListsRepo } from '../repos/lists'
import type { MappingsRepo } from '../repos/mappings'
import { logger } from '../logger'
import {
  openWorkbook,
  parseSheet,
  sheetSummaries,
  type OpenedWorkbook,
  type ParsedSheet,
} from './parser'

const PREVIEW_ROWS = 50
const MAX_SAMPLES = 200

export class ImportService {
  private readonly open = new Map<string, OpenedWorkbook>()
  private readonly sheetCache = new Map<string, ParsedSheet>()

  constructor(
    private readonly db: DB,
    private readonly leads: LeadsRepo,
    private readonly lists: ListsRepo,
    private readonly mappings: MappingsRepo,
  ) {}

  openFile(path: string): ImportFileInfo {
    const wb = openWorkbook(path)
    const token = randomUUID()
    // Only one import at a time; free previous workbooks.
    this.open.clear()
    this.sheetCache.clear()
    this.open.set(token, wb)
    const sheets = sheetSummaries(wb.workbook)
    logger.info(`[import] opened workbook with ${sheets.length} sheet(s)`)
    return { token, fileName: wb.fileName, sheets }
  }

  close(token: string): void {
    this.open.delete(token)
    for (const key of this.sheetCache.keys())
      if (key.startsWith(`${token}:`)) this.sheetCache.delete(key)
  }

  private sheet(token: string, sheet: string): ParsedSheet {
    const key = `${token}:${sheet}`
    const cached = this.sheetCache.get(key)
    if (cached) return cached
    const wb = this.open.get(token)
    if (!wb) throw new AppError('notFound', 'import session')
    const parsed = parseSheet(wb.workbook, sheet)
    this.sheetCache.set(key, parsed)
    return parsed
  }

  preview(token: string, sheet: string): SheetPreview {
    const parsed = this.sheet(token, sheet)
    const saved = this.mappings.get(headerSignature(parsed.headers))
    const mapping = saved ? applySavedMapping(saved, parsed.headers) : detectColumns(parsed.headers)
    return {
      headers: parsed.headers,
      rows: parsed.rows.slice(0, PREVIEW_ROWS),
      totalRows: parsed.rows.length,
      mapping,
      mappingSource: saved ? 'saved' : 'auto',
    }
  }

  private classify(token: string, sheet: string, mapping: ColumnMapping): ClassifiedRow[] {
    const parsed = this.sheet(token, sheet)
    const mapped = mapRows(parsed.headers, parsed.rows, mapping, parsed.firstRow)
    return classifyRows(mapped, parsed.rows, this.leads.existingEmails())
  }

  validate(token: string, sheet: string, mapping: ColumnMapping): ImportReport {
    const parsed = this.sheet(token, sheet)
    const rows = this.classify(token, sheet, mapping)
    const dnc = this.leads.doNotContactEmails()
    const bucket = (category: ClassifiedRow['category']): ImportReport['invalid'] => {
      const items = rows.filter((r) => r.category === category)
      return {
        count: items.length,
        samples: items
          .slice(0, MAX_SAMPLES)
          .map((r): ImportIssue => ({ row: r.data.row, name: r.data.name, email: r.data.email })),
      }
    }
    const mapped = new Set(targetFields.map((f) => mapping[f]).filter(Boolean))
    return {
      totalRows: rows.length,
      emptyRows: rows.filter((r) => r.category === 'empty').length,
      readyRows: rows.filter((r) => r.category === 'ok').length,
      invalid: bucket('invalid'),
      fileDuplicates: bucket('fileDuplicate'),
      dbDuplicates: bucket('dbDuplicate'),
      doNotContact: rows.filter((r) => r.category !== 'empty' && dnc.has(r.data.emailNorm)).length,
      extraColumns: parsed.headers.filter((h) => !mapped.has(h)),
    }
  }

  commit(input: ImportCommitInput & { decisions: ImportDecisions }): ImportResult {
    const parsed = this.sheet(input.token, input.sheet)
    const rows = this.classify(input.token, input.sheet, input.mapping)
    const { decisions } = input
    const dnc = this.leads.doNotContactEmails()

    const result = this.db.transaction((): ImportResult => {
      const listId =
        'listId' in input.target ? input.target.listId : this.lists.create(input.target.newListName)
      let inserted = 0
      let updated = 0
      let skipped = 0
      for (const { data, category } of rows) {
        const lead = {
          listId,
          name: data.name,
          firstName: data.firstName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          productRaw: data.product,
          extra: data.extra,
        }
        const action =
          category === 'empty'
            ? 'skip'
            : category === 'invalid'
              ? decisions.invalid
              : category === 'fileDuplicate'
                ? decisions.fileDuplicates
                : category === 'dbDuplicate'
                  ? decisions.dbDuplicates
                  : 'import'
        if (action === 'skip') {
          skipped++
        } else if (action === 'update') {
          updated += this.leads.updateByEmail(data.emailNorm, lead).length
        } else {
          this.leads.insert(lead, dnc)
          inserted++
        }
      }
      this.mappings.save(headerSignature(parsed.headers), input.mapping)
      return { listId, inserted, updated, skipped }
    })()

    logger.info(
      `[import] committed: inserted=${result.inserted} updated=${result.updated} skipped=${result.skipped}`,
    )
    this.close(input.token)
    return result
  }
}
