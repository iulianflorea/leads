import { z } from 'zod'
import { columnMappingSchema } from '../import/fields'

export interface ImportFileInfo {
  token: string
  fileName: string
  sheets: Array<{ name: string; rowCount: number }>
}

export interface SheetPreview {
  headers: string[]
  rows: string[][]
  totalRows: number
  mapping: z.infer<typeof columnMappingSchema>
  mappingSource: 'saved' | 'auto'
}

export interface ImportIssue {
  /** 1-based row number as shown in the spreadsheet. */
  row: number
  name: string
  email: string
}

export interface ImportReport {
  totalRows: number
  emptyRows: number
  readyRows: number
  invalid: { count: number; samples: ImportIssue[] }
  fileDuplicates: { count: number; samples: ImportIssue[] }
  dbDuplicates: { count: number; samples: ImportIssue[] }
  doNotContact: number
  extraColumns: string[]
}

export const importDecisionsSchema = z.object({
  invalid: z.enum(['skip', 'import']).default('skip'),
  fileDuplicates: z.enum(['skip', 'import']).default('skip'),
  dbDuplicates: z.enum(['skip', 'update', 'import']).default('skip'),
})
export type ImportDecisions = z.infer<typeof importDecisionsSchema>

export const sheetRefSchema = z.object({
  token: z.string().min(1),
  sheet: z.string(),
})

export const importValidateSchema = sheetRefSchema.extend({ mapping: columnMappingSchema })

export const importCommitSchema = importValidateSchema.extend({
  target: z.union([
    z.object({ listId: z.number().int() }),
    z.object({ newListName: z.string().trim().min(1).max(200) }),
  ]),
  decisions: importDecisionsSchema,
})
export type ImportCommitInput = z.input<typeof importCommitSchema>

export interface ImportResult {
  listId: number
  inserted: number
  updated: number
  skipped: number
}
