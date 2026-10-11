import { describe, expect, it } from 'vitest'
import { cleanEmail, deriveFirstName, isValidEmail, splitProducts } from '@shared/import/validate'
import { foldText, normalizeKey } from '@shared/matching/normalize'

describe('email validation', () => {
  it.each(['ana@example.ro', 'a.b+tag@sub.domain.com', 'ION@FIRMA.RO'])('accepts %s', (e) => {
    expect(isValidEmail(e)).toBe(true)
  })
  it.each(['', 'ana', 'ana@', 'ana@example', 'ana @example.ro', 'a@b.c', 'ana@@example.ro'])(
    'rejects %s',
    (e) => {
      expect(isValidEmail(e)).toBe(false)
    },
  )
  it('extracts addresses from display-name and mailto formats', () => {
    expect(cleanEmail('Ana Pop <ana@example.ro>')).toBe('ana@example.ro')
    expect(cleanEmail(' mailto:ion@x.ro ')).toBe('ion@x.ro')
  })
})

describe('splitProducts', () => {
  it('splits on , ; / and removes duplicates', () => {
    expect(splitProducts('Pompă de căldură, Panouri; Boiler / panouri')).toEqual([
      'Pompă de căldură',
      'Panouri',
      'Boiler',
    ])
  })
  it('returns an empty list for blank cells', () => {
    expect(splitProducts('  ')).toEqual([])
  })
})

describe('normalization', () => {
  it('folds Romanian diacritics including cedilla forms', () => {
    expect(foldText('Ştefan Ţurcanu ȘȚĂÂÎ')).toBe('stefan turcanu staai')
  })
  it('removes spaces and punctuation for keys', () => {
    expect(normalizeKey('  Pompă-Căldură 9 kW! ')).toBe('pompacaldura9kw')
  })
  it('derives the first name from the first word', () => {
    expect(deriveFirstName('  Maria  Ionescu ')).toBe('Maria')
  })
})
