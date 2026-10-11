import { describe, expect, it } from 'vitest'
import { editDistance, similarity } from '@shared/matching/fuzzy'

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['email', 'emial', 1],
    ['telefon', 'telfon', 1],
    ['same', 'same', 0],
  ])('%s -> %s = %i', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected)
  })
})

describe('similarity', () => {
  it('is 1 for identical strings and lower for different ones', () => {
    expect(similarity('boiler', 'boiler')).toBe(1)
    expect(similarity('boiler', 'boyler')).toBeCloseTo(5 / 6)
    expect(similarity('abc', 'xyz')).toBe(0)
  })
})
