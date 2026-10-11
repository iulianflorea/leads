import { writeFileSync } from 'node:fs'
import { t, type MessageKey } from '@shared/i18n'
import type { HistoryQuery, SendRecord } from '@shared/schemas/send'
import type { SendsRepo } from '../repos/sends'

function cell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function reason(r: SendRecord): string {
  if (!r.errorCode) return ''
  const key = r.errorCode.startsWith('skip') ? `skipReason.${r.errorCode}` : `errors.${r.errorCode}`
  const text = t(key as MessageKey)
  return text === key ? r.errorCode : text
}

/**
 * CSV for Excel: UTF-8 with BOM and ";" separators (what Excel expects with Romanian
 * regional settings), one row per email.
 */
export function historyToCsv(rows: SendRecord[]): string {
  const header = [
    t('history.colDate'),
    t('history.colRecipient'),
    t('history.colEmail'),
    t('history.colSubject'),
    t('history.colTemplate'),
    t('history.colAttachments'),
    t('history.colStatus'),
    t('history.colError'),
  ]
  const lines = rows.map((r) =>
    [
      r.sentAt ?? r.createdAt,
      r.toName,
      r.toEmail,
      r.subject,
      r.templateName,
      r.attachments.map((a) => a.name).join(', '),
      t(`sendStatus.${r.status}` as MessageKey),
      reason(r),
    ]
      .map((v) => cell(String(v ?? '')))
      .join(';'),
  )
  return '﻿' + [header.map(cell).join(';'), ...lines].join('\r\n') + '\r\n'
}

export class HistoryService {
  constructor(private readonly sends: SendsRepo) {}

  query(q: HistoryQuery): SendRecord[] {
    return this.sends.query(q)
  }

  exportCsv(q: HistoryQuery, path: string): number {
    const rows = this.sends.query(q, 1_000_000)
    writeFileSync(path, historyToCsv(rows), 'utf8')
    return rows.length
  }
}
