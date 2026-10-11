import { describe, expect, it } from 'vitest'
import { ProductMatcher } from '@shared/matching/products'

const products = [
  { id: 1, name: 'Pompă de căldură', synonyms: ['heat pump', 'pompa caldura'] },
  { id: 2, name: 'Panouri fotovoltaice', synonyms: ['panouri solare', 'fotovoltaice'] },
  { id: 3, name: 'Boiler termoelectric', synonyms: [] },
  { id: 4, name: 'Pompă de căldură aer-apă', synonyms: [] },
]
const matcher = new ProductMatcher(products)

describe('ProductMatcher.match', () => {
  it.each([
    ['Pompă de căldură', 1],
    ['POMPA DE CALDURA', 1],
    ['pompa-de-caldura', 1],
    ['  Pompă   de  căldură! ', 1],
    ['Heat Pump', 1],
    ['panouri solare', 2],
    ['Fotovoltaice', 2],
  ])('matches %s exactly', (value, id) => {
    expect(matcher.match(value)).toEqual({ productId: id, score: 1, kind: 'exact' })
  })

  it('matches values containing a product name, preferring the longest', () => {
    expect(matcher.match('Panouri fotovoltaice 5kW')).toMatchObject({ productId: 2, kind: 'contains' })
    expect(matcher.match('Pompă de căldură aer-apă 9 kW')).toMatchObject({ productId: 4, kind: 'contains' })
  })

  it('matches small typos by similarity', () => {
    expect(matcher.match('Pompă căldură')).toMatchObject({ productId: 1 })
    expect(matcher.match('Boiler termoelecric')).toMatchObject({ productId: 3, kind: 'fuzzy' })
  })

  it('does not match unrelated or too vague values', () => {
    expect(matcher.match('Centrală termică')).toBeNull()
    expect(matcher.match('Stație de încărcare')).toBeNull()
    expect(matcher.match('Boiler')).toBeNull()
    expect(matcher.match('')).toBeNull()
  })

  it('suggests likely products for unmatched values', () => {
    expect(matcher.suggest('Boiler')[0]).toMatchObject({ productId: 3 })
    expect(matcher.suggest('Panouri')[0]).toMatchObject({ productId: 2 })
  })

  it('works with no products', () => {
    expect(new ProductMatcher([]).match('x')).toBeNull()
  })
})
