import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OUTLOOK_SCRIPT } from '../../src/main/mailer/outlook-script'
import { powershellRunner } from '../../src/main/mailer/outlook'

// Runs only on Windows (CI packaging job); elsewhere PowerShell and Outlook are absent.
describe.runIf(process.platform === 'win32')('Outlook PowerShell script on Windows', () => {
  it('parses without syntax errors', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-ps-'))
    const file = join(dir, 'script.ps1')
    writeFileSync(file, '﻿' + OUTLOOK_SCRIPT, 'utf8')
    const check = `$errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file}', [ref]$null, [ref]$errors); $errors.Count`
    const count = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', check],
      {
        encoding: 'utf8',
      },
    ).trim()
    expect(count).toBe('0')
  })

  it('runs end to end and answers with JSON (Outlook missing on CI -> outlookUnavailable)', async () => {
    const run = powershellRunner(() => mkdtempSync(join(tmpdir(), 'lm-ol-')), 60_000)
    const result = await run({ action: 'accounts' })
    if (result.ok) {
      expect(Array.isArray(result.accounts) || typeof result.accounts === 'object').toBe(true)
    } else {
      expect(result.code).toBe('outlookUnavailable')
    }
  }, 90_000)
})
