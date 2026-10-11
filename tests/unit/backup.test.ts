import Database from 'better-sqlite3'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { migrate } from '../../src/main/db/migrate'
import { applyPendingRestore, createBackup, stageRestore } from '../../src/main/services/backup'

function setup(): { dir: string; db: Database.Database; dbFile: string; pdfDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lm-backup-'))
  const dbFile = join(dir, 'leadmailer.db')
  const db = new Database(dbFile)
  migrate(db)
  db.prepare(
    "INSERT INTO leads (name, email, email_norm) VALUES ('Ana', 'ana@x.ro', 'ana@x.ro')",
  ).run()
  db.prepare(
    "INSERT INTO settings (key, value) VALUES ('theme', '\"dark\"'), ('secret.smtpPassword', '\"x\"')",
  ).run()
  const pdfDir = join(dir, 'pdfs')
  mkdirSync(pdfDir)
  writeFileSync(join(pdfDir, 'a.pdf'), '%PDF-1.4 test')
  return { dir, db, dbFile, pdfDir }
}

describe('backup', () => {
  it('round-trips the database and PDFs, without secrets', async () => {
    const src = setup()
    const zip = join(src.dir, 'backup.zip')
    const manifest = await createBackup({
      db: src.db,
      pdfDir: src.pdfDir,
      outFile: zip,
      appVersion: '1.0.0',
    })
    expect(manifest.pdfCount).toBe(1)

    const dst = setup()
    dst.db.prepare('DELETE FROM leads').run()
    dst.db.close()
    const staging = join(dst.dir, 'restore-staging')
    stageRestore({ zipFile: zip, stagingDir: staging, currentSchema: manifest.schemaVersion })
    expect(
      applyPendingRestore({ dbFile: dst.dbFile, pdfDir: dst.pdfDir, stagingDir: staging }),
    ).toBe(true)

    const restored = new Database(dst.dbFile)
    expect(restored.prepare('SELECT name FROM leads').pluck().all()).toEqual(['Ana'])
    expect(
      restored.prepare("SELECT COUNT(*) FROM settings WHERE key LIKE 'secret.%'").pluck().get(),
    ).toBe(0)
    expect(restored.prepare("SELECT value FROM settings WHERE key = 'theme'").pluck().get()).toBe(
      '"dark"',
    )
    restored.close()
    expect(readFileSync(join(dst.pdfDir, 'a.pdf'), 'utf8')).toBe('%PDF-1.4 test')
    expect(existsSync(`${dst.dbFile}.before-restore`)).toBe(true)
    expect(existsSync(staging)).toBe(false)
  })

  it('does nothing when no restore is staged', () => {
    const s = setup()
    expect(
      applyPendingRestore({ dbFile: s.dbFile, pdfDir: s.pdfDir, stagingDir: join(s.dir, 'none') }),
    ).toBe(false)
  })

  it('rejects files that are not backups', () => {
    const s = setup()
    const notZip = join(s.dir, 'x.zip')
    writeFileSync(notZip, 'hello')
    expect(() =>
      stageRestore({ zipFile: notZip, stagingDir: join(s.dir, 'st'), currentSchema: 9 }),
    ).toThrow(expect.objectContaining({ code: 'backupInvalid' }))
    const wrongApp = join(s.dir, 'y.zip')
    writeFileSync(
      wrongApp,
      zipSync({ 'manifest.json': strToU8('{"app":"Other"}'), 'leadmailer.db': strToU8('x') }),
    )
    expect(() =>
      stageRestore({ zipFile: wrongApp, stagingDir: join(s.dir, 'st'), currentSchema: 9 }),
    ).toThrow(expect.objectContaining({ code: 'backupInvalid' }))
  })

  it('refuses backups from a newer schema', async () => {
    const s = setup()
    const zip = join(s.dir, 'b.zip')
    await createBackup({ db: s.db, pdfDir: s.pdfDir, outFile: zip, appVersion: '9' })
    expect(() =>
      stageRestore({ zipFile: zip, stagingDir: join(s.dir, 'st'), currentSchema: 1 }),
    ).toThrow(expect.objectContaining({ code: 'backupInvalid' }))
    expect(readdirSync(s.dir)).not.toContain('st')
  })
})
