import {
  copyFileSync,
  existsSync,
  openSync,
  readSync,
  closeSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { MAX_PDF_SIZE } from '@shared/config'
import { AppError } from '@shared/errors'
import { ProductMatcher } from '@shared/matching/products'
import { normalizeKey } from '@shared/matching/normalize'
import type {
  Product,
  ProductInput,
  ResolveValueInput,
  UnmatchedValue,
} from '@shared/schemas/product'
import type { ProductsRepo } from '../repos/products'
import type { LeadsRepo, ProductResolver } from '../repos/leads'
import { logger } from '../logger'

function isPdf(path: string): boolean {
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(5)
    readSync(fd, head, 0, 5, 0)
    return head.toString('latin1') === '%PDF-'
  } finally {
    closeSync(fd)
  }
}

/** Products, their PDFs and matching of lead product values. */
export class ProductsService implements ProductResolver {
  private matcher = new ProductMatcher([])

  constructor(
    private readonly repo: ProductsRepo,
    private readonly leads: LeadsRepo,
    private readonly pdfDir: () => string,
  ) {
    this.refreshMatcher()
    leads.setResolver(this)
  }

  resolve(value: string): number | null {
    return this.matcher.match(value)?.productId ?? null
  }

  private refreshMatcher(): void {
    this.matcher = new ProductMatcher(this.repo.matchable())
  }

  /** Rebuilds the matcher and re-resolves every lead product value. */
  rematch(): void {
    this.refreshMatcher()
    this.leads.rematchAll()
  }

  list(): Product[] {
    return this.repo.all()
  }

  create(input: Required<ProductInput>): number {
    const id = this.repo.create(input.name, input.active, input.synonyms)
    this.rematch()
    return id
  }

  update(id: number, patch: { name?: string; active?: boolean; synonyms?: string[] }): void {
    this.repo.update(id, patch)
    this.rematch()
  }

  delete(id: number): void {
    const file = this.repo.delete(id)
    if (file) this.removeFile(file)
    this.rematch()
  }

  /** Validates and copies a PDF into userData/pdfs, replacing any previous file. */
  attachPdf(id: number, sourcePath: string): void {
    let size: number
    try {
      size = statSync(sourcePath).size
    } catch (cause) {
      throw new AppError('fileUnreadable', basename(sourcePath), { cause })
    }
    if (size > MAX_PDF_SIZE) throw new AppError('attachmentTooLarge', String(size))
    if (!isPdf(sourcePath)) throw new AppError('fileUnsupported', 'not a PDF')
    const file = `${randomUUID()}.pdf`
    copyFileSync(sourcePath, join(this.pdfDir(), file))
    const previous = this.repo.setPdf(id, { file, name: basename(sourcePath), size })
    if (previous) this.removeFile(previous)
    logger.info(`[products] attached PDF to product ${id} (${size} bytes)`)
  }

  removePdf(id: number): void {
    const previous = this.repo.setPdf(id, null)
    if (previous) this.removeFile(previous)
  }

  pdfPath(id: number): string {
    const path = this.repo.pdfPath(id)
    if (!path || !existsSync(path)) throw new AppError('pdfMissing')
    return path
  }

  unmatched(): UnmatchedValue[] {
    const names = new Map(this.repo.all().map((p) => [p.id, p.name]))
    return this.repo.unmatchedValues().map((v) => ({
      ...v,
      suggestions: this.matcher
        .suggest(v.value)
        .map((s) => ({ ...s, name: names.get(s.productId) ?? '' }))
        .filter((s) => s.name),
    }))
  }

  resolveValue({ value, action }: ResolveValueInput): void {
    if (action.kind === 'link') this.repo.addSynonym(action.productId, value)
    else if (action.kind === 'create')
      this.repo.create(
        action.name,
        true,
        normalizeKey(action.name) === normalizeKey(value) ? [] : [value],
      )
    else this.repo.ignore(value)
    this.rematch()
  }

  ignoredValues(): ReturnType<ProductsRepo['ignoredValues']> {
    return this.repo.ignoredValues()
  }

  unignore(valueNorm: string): void {
    this.repo.unignore(valueNorm)
  }

  private removeFile(file: string): void {
    try {
      unlinkSync(join(this.pdfDir(), file))
    } catch {
      // Already gone; nothing to clean up.
    }
  }
}
