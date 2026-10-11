import { describe, expect, it } from 'vitest'
import { classifyRows, mapRows } from '@shared/import/classify'
import { emptyMapping } from '@shared/import/fields'

const headers = ['Nume', 'Email', 'Produs', 'Oraș', 'Sursa']
const mapping = { ...emptyMapping, name: 'Nume', email: 'Email', product: 'Produs' }

describe('mapRows', () => {
  it('maps fields, derives first name and keeps unmapped columns as extra', () => {
    const [row] = mapRows(headers, [['Ana Pop', ' ANA@x.ro ', 'Boiler', 'Cluj', '']], mapping, 2)
    expect(row).toEqual({
      row: 2,
      name: 'Ana Pop',
      firstName: 'Ana',
      email: 'ANA@x.ro',
      emailNorm: 'ana@x.ro',
      phone: '',
      address: '',
      product: 'Boiler',
      extra: { Oraș: 'Cluj' },
    })
  })
})

describe('classifyRows', () => {
  const raw = [
    ['Ana', 'ana@x.ro', 'A', '', ''],
    ['', '', '', '', ''],
    ['Ion', 'not-an-email', 'B', '', ''],
    ['Ana 2', 'ANA@x.ro', 'C', '', ''],
    ['Maria', 'maria@x.ro', '', '', ''],
    ['Dan', 'dan@x.ro', '', '', ''],
  ]
  it('assigns each row one category by precedence', () => {
    const mapped = mapRows(headers, raw, mapping, 2)
    const result = classifyRows(mapped, raw, new Set(['maria@x.ro']))
    expect(result.map((r) => r.category)).toEqual([
      'ok',
      'empty',
      'invalid',
      'fileDuplicate',
      'dbDuplicate',
      'ok',
    ])
  })
})
