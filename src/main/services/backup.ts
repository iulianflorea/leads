import Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { strToU8, strFromU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { z } from 'zod'
import { APP_NAME } from '@shared/config'
import { AppError } from '@shared/errors'
import type { DB } from '../db/connection'

const BACKUP_FORMAT = 1
const DB_ENTRY = 'leadmailer.db'
const MANIFEST = 'manifest.json'

const manifestSchema = z.object({
  app: z.literal(APP_NAME),
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().min(1),
  appVersion: z.string(),
  createdAt: z.string(),
  pdfCount: z.number().int().min(0),
})
export type BackupManifest = z.infer<typeof manifestSchema>

/**
 * Writes a .zip with a consistent copy of the database and every product PDF. Secrets tied
 * to this computer (Microsoft tokens, the encrypted SMTP password) are left out.
 */
export async function createBackup(opts: {
  db: DB
  pdfDir: string
  outFile: string
  appVersion: string
}): Promise<BackupManifest> {
  const tmp = join(tmpdir(), `leadmailer-backup-${randomUUID()}.db`)
  try {
    await opts.db.backup(tmp)
    const copy = new Database(tmp)
    copy.prepare("DELETE FROM settings WHERE key LIKE 'secret.%'").run()
    const schemaVersion = copy.pragma('user_version', { simple: true }) as number
    copy.pragma('journal_mode = DELETE')
    copy.close()

    const pdfs = existsSync(opts.pdfDir)
      ? readdirSync(opts.pdfDir).filter((f) => f.endsWith('.pdf'))
      : []
    const manifest: BackupManifest = {
      app: APP_NAME,
      format: BACKUP_FORMAT,
      schemaVersion,
      appVersion: opts.appVersion,
      createdAt: new Date().toISOString(),
      pdfCount: pdfs.length,
    }
    const files: Zippable = {
      [MANIFEST]: strToU8(JSON.stringify(manifest, null, 2)),
      [DB_ENTRY]: [readFileSync(tmp), { level: 6 }],
    }
    // PDFs are already compressed; store them as-is.
    for (const f of pdfs) files[`pdfs/${f}`] = [readFileSync(join(opts.pdfDir, f)), { level: 0 }]
    writeFileSync(opts.outFile, zipSync(files))
    return manifest
  } finally {
    rmSync(tmp, { force: true })
  }
}

/**
 * Validates a backup and stages it next to the live data. The swap happens on the next
 * start, before the database is opened (see applyPendingRestore).
 */
export function stageRestore(opts: {
  zipFile: string
  stagingDir: string
  currentSchema: number
}): BackupManifest {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(readFileSync(opts.zipFile))
  } catch (cause) {
    throw new AppError('backupInvalid', 'not a zip', { cause })
  }
  const rawManifest = entries[MANIFEST]
  const dbBytes = entries[DB_ENTRY]
  if (!rawManifest || !dbBytes) throw new AppError('backupInvalid', 'missing entries')
  const parsed = manifestSchema.safeParse(JSON.parse(strFromU8(rawManifest)))
  if (!parsed.success) throw new AppError('backupInvalid', 'manifest')
  if (parsed.data.schemaVersion > opts.currentSchema)
    throw new AppError('backupInvalid', 'made by a newer version')

  rmSync(opts.stagingDir, { recursive: true, force: true })
  mkdirSync(join(opts.stagingDir, 'pdfs'), { recursive: true })
  const dbFile = join(opts.stagingDir, DB_ENTRY)
  writeFileSync(dbFile, dbBytes)
  try {
    const check = new Database(dbFile, { readonly: true })
    const ok = check.pragma('quick_check', { simple: true })
    const hasLeads = check
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leads'")
      .get()
    check.close()
    if (ok !== 'ok' || !hasLeads) throw new AppError('backupInvalid', 'database check failed')
  } catch (error) {
    rmSync(opts.stagingDir, { recursive: true, force: true })
    throw error instanceof AppError
      ? error
      : new AppError('backupInvalid', 'database', { cause: error })
  }
  for (const [name, bytes] of Object.entries(entries)) {
    const m = /^pdfs\/([\w.-]+\.pdf)$/.exec(name)
    if (m) writeFileSync(join(opts.stagingDir, 'pdfs', m[1]!), bytes)
  }
  writeFileSync(join(opts.stagingDir, 'ready'), parsed.data.createdAt)
  return parsed.data
}

/**
 * If a restore was staged, swaps it in. The previous data is kept as *.before-restore
 * (one generation) so a mistaken restore can be undone by hand.
 */
export function applyPendingRestore(opts: {
  dbFile: string
  pdfDir: string
  stagingDir: string
}): boolean {
  if (!existsSync(join(opts.stagingDir, 'ready'))) return false
  const keep = (path: string): void => {
    const backup = `${path}.before-restore`
    rmSync(backup, { recursive: true, force: true })
    if (existsSync(path)) renameSync(path, backup)
  }
  keep(opts.dbFile)
  for (const suffix of ['-wal', '-shm']) rmSync(opts.dbFile + suffix, { force: true })
  keep(opts.pdfDir)
  renameSync(join(opts.stagingDir, DB_ENTRY), opts.dbFile)
  renameSync(join(opts.stagingDir, 'pdfs'), opts.pdfDir)
  rmSync(opts.stagingDir, { recursive: true, force: true })
  return true
}
