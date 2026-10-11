import { describe, expect, it } from 'vitest'
import {
  applySavedMapping,
  detectColumns,
  headerSignature,
  scoreHeader,
} from '@shared/import/detect'

describe('detectColumns', () => {
  it('maps common Romanian headers', () => {
    expect(detectColumns(['Nume', 'E-mail', 'Telefon', 'Adresă', 'Produs de interes'])).toEqual({
      name: 'Nume',
      firstName: null,
      email: 'E-mail',
      phone: 'Telefon',
      address: 'Adresă',
      product: 'Produs de interes',
    })
  })

  it('maps common English headers regardless of case and punctuation', () => {
    expect(
      detectColumns(['FULL NAME', 'Email Address', 'Phone number', 'Address', 'Product']),
    ).toEqual({
      name: 'FULL NAME',
      firstName: null,
      email: 'Email Address',
      phone: 'Phone number',
      address: 'Address',
      product: 'Product',
    })
  })

  it('distinguishes first name from full name', () => {
    const m = detectColumns(['Nume și prenume', 'Prenume', 'Mail'])
    expect(m.name).toBe('Nume și prenume')
    expect(m.firstName).toBe('Prenume')
    expect(m.email).toBe('Mail')
  })

  it('prefers email over address for "Adresa e-mail"', () => {
    const m = detectColumns(['Adresa e-mail', 'Adresa', 'Client'])
    expect(m.email).toBe('Adresa e-mail')
    expect(m.address).toBe('Adresa')
    expect(m.name).toBe('Client')
  })

  it('tolerates small typos', () => {
    const m = detectColumns(['Nume', 'Emial', 'Telfon', 'Produs'])
    expect(m.email).toBe('Emial')
    expect(m.phone).toBe('Telfon')
  })

  it('maps mobile / GSM style phone headers', () => {
    expect(detectColumns(['Mobil']).phone).toBe('Mobil')
    expect(detectColumns(['Nr. tel.']).phone).toBe('Nr. tel.')
  })

  it('leaves unrelated columns unmapped', () => {
    const m = detectColumns(['Data', 'Observații', 'Sursa'])
    expect(Object.values(m).every((v) => v === null)).toBe(true)
  })

  it('never maps the same header twice', () => {
    const m = detectColumns(['Email'])
    expect(Object.values(m).filter((v) => v === 'Email')).toHaveLength(1)
  })

  it('scores exact synonyms as 1', () => {
    expect(scoreHeader('Telefon', 'phone')).toBe(1)
    expect(scoreHeader('Telefon', 'email')).toBeLessThan(0.72)
  })
})

describe('headerSignature', () => {
  it('ignores order, case, diacritics and punctuation', () => {
    expect(headerSignature(['Nume', 'E-mail', 'Adresă'])).toBe(
      headerSignature(['adresa', 'e mail', 'NUME']),
    )
  })

  it('differs for different headers', () => {
    expect(headerSignature(['Nume', 'Email'])).not.toBe(headerSignature(['Nume', 'Telefon']))
  })
})

describe('applySavedMapping', () => {
  it('drops headers that no longer exist', () => {
    const saved = {
      name: 'Nume',
      firstName: null,
      email: 'Mail',
      phone: 'Tel',
      address: null,
      product: null,
    }
    expect(applySavedMapping(saved, ['Nume', 'Mail'])).toEqual({ ...saved, phone: null })
  })
})
