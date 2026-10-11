import { vi } from 'vitest'
vi.mock('../../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
import { describe, expect, it } from 'vitest'
import { historyToCsv } from '../../src/main/services/history'
import type { SendRecord } from '@shared/schemas/send'

const row = (over: Partial<SendRecord>): SendRecord => ({
  id: 1,
  jobId: 1,
  leadId: 1,
  templateId: 1,
  templateName: 'Ofertă',
  toEmail: 'ana@x.ro',
  toName: 'Ana',
  subject: 'Salut',
  attachments: [],
  status: 'sent',
  errorCode: null,
  errorDetail: null,
  attempts: 1,
  provider: 'mock',
  createdAt: '2026-10-11T10:00:00.000Z',
  sentAt: '2026-10-11T10:00:05.000Z',
  ...over,
})

describe('historyToCsv', () => {
  it('starts with a BOM, uses ; separators and translates statuses', () => {
    const csv = historyToCsv([row({})])
    expect(csv.startsWith('﻿Data;Destinatar;Email')).toBe(true)
    expect(csv).toContain('2026-10-11T10:00:05.000Z;Ana;ana@x.ro;Salut;Ofertă;;Trimis;')
  })

  it('quotes cells with separators, quotes and newlines', () => {
    const csv = historyToCsv([row({ subject: 'A; "B"\nC' })])
    expect(csv).toContain('"A; ""B""\nC"')
  })

  it('explains errors and skip reasons in Romanian', () => {
    const csv = historyToCsv([
      row({ status: 'failed', errorCode: 'recipientRejected' }),
      row({ status: 'skipped', errorCode: 'skipDoNotContact', sentAt: null }),
    ])
    expect(csv).toContain('Eșuat;Adresa destinatarului a fost respinsă')
    expect(csv).toContain('Sărit;Marcat „Nu contacta”')
  })

  it('lists attachments', () => {
    const csv = historyToCsv([
      row({
        attachments: [
          { productId: 1, name: 'a.pdf', file: 'x', size: 1 },
          { productId: 2, name: 'b.pdf', file: 'y', size: 1 },
        ],
      }),
    ])
    expect(csv).toContain(';a.pdf, b.pdf;')
  })
})
