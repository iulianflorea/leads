import { create } from 'zustand'
import type { ColumnMapping } from '@shared/import/fields'
import type {
  ImportDecisions,
  ImportFileInfo,
  ImportReport,
  ImportResult,
  SheetPreview,
} from '@shared/schemas/import'
import { call } from '@renderer/lib/api'
import { toast } from './toast'

export type ImportStep = 'file' | 'mapping' | 'review' | 'done'

interface ImportState {
  step: ImportStep
  busy: boolean
  file: ImportFileInfo | null
  sheet: string | null
  preview: SheetPreview | null
  mapping: ColumnMapping | null
  report: ImportReport | null
  decisions: ImportDecisions
  target: { kind: 'new'; name: string } | { kind: 'existing'; listId: number | null }
  result: ImportResult | null
  openPath(path: string): Promise<void>
  selectSheet(sheet: string): Promise<void>
  setMapping(mapping: ColumnMapping): void
  toReview(): Promise<void>
  setDecisions(patch: Partial<ImportDecisions>): void
  setTarget(target: ImportState['target']): void
  commit(): Promise<void>
  back(): void
  reset(): void
}

const initial = {
  step: 'file' as ImportStep,
  busy: false,
  file: null,
  sheet: null,
  preview: null,
  mapping: null,
  report: null,
  decisions: { invalid: 'skip', fileDuplicates: 'skip', dbDuplicates: 'skip' } as ImportDecisions,
  target: { kind: 'new', name: '' } as ImportState['target'],
  result: null,
}

export function defaultListName(fileName: string): string {
  const base = fileName.replace(/\.(xlsx|xls|csv)$/i, '')
  const date = new Date().toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  return `${base} · ${date}`
}

export const useImport = create<ImportState>((set, get) => ({
  ...initial,

  async openPath(path) {
    set({ busy: true })
    try {
      const file = await call('import:open', { path })
      set({ ...initial, file, target: { kind: 'new', name: defaultListName(file.fileName) } })
      const withRows = file.sheets.filter((s) => s.rowCount > 0)
      if (file.sheets.length === 1 || withRows.length === 1) {
        await get().selectSheet((withRows[0] ?? file.sheets[0])!.name)
      }
    } catch (error) {
      toast.error(error)
    } finally {
      set({ busy: false })
    }
  },

  async selectSheet(sheet) {
    const file = get().file
    if (!file) return
    set({ busy: true })
    try {
      const preview = await call('import:preview', { token: file.token, sheet })
      set({ sheet, preview, mapping: preview.mapping, step: 'mapping' })
    } catch (error) {
      toast.error(error)
    } finally {
      set({ busy: false })
    }
  },

  setMapping(mapping) {
    set({ mapping })
  },

  async toReview() {
    const { file, sheet, mapping } = get()
    if (!file || !sheet || !mapping) return
    set({ busy: true })
    try {
      const report = await call('import:validate', { token: file.token, sheet, mapping })
      set({ report, step: 'review' })
    } catch (error) {
      toast.error(error)
    } finally {
      set({ busy: false })
    }
  },

  setDecisions(patch) {
    set({ decisions: { ...get().decisions, ...patch } })
  },

  setTarget(target) {
    set({ target })
  },

  async commit() {
    const { file, sheet, mapping, decisions, target } = get()
    if (!file || !sheet || !mapping) return
    set({ busy: true })
    try {
      const result = await call('import:commit', {
        token: file.token,
        sheet,
        mapping,
        decisions,
        target:
          target.kind === 'new' ? { newListName: target.name } : { listId: target.listId ?? 0 },
      })
      set({ result, step: 'done' })
    } catch (error) {
      toast.error(error)
    } finally {
      set({ busy: false })
    }
  },

  back() {
    const step = get().step
    if (step === 'review') set({ step: 'mapping' })
    else if (step === 'mapping') set({ step: 'file', preview: null, sheet: null })
  },

  reset() {
    const token = get().file?.token
    if (token && get().step !== 'done') void call('import:close', { token }).catch(() => undefined)
    set({ ...initial })
  },
}))
