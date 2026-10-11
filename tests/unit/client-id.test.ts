import { describe, expect, it, vi } from 'vitest'
import { isValidClientId } from '@shared/config'
import { settingsPatchSchema } from '@shared/schemas/settings'

vi.mock('electron', () => ({ shell: {}, safeStorage: {} }))
vi.mock('../../src/main/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
const { resolveClientId } = await import('../../src/main/auth/microsoft')

const A = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b'
const B = '11111111-2222-4333-8444-555555555555'
const PLACEHOLDER = '00000000-0000-0000-0000-000000000000'

describe('isValidClientId', () => {
  it('accepts GUIDs (any case, surrounding spaces) and rejects the rest', () => {
    expect(isValidClientId(A)).toBe(true)
    expect(isValidClientId(` ${A.toUpperCase()} `)).toBe(true)
    expect(isValidClientId(PLACEHOLDER)).toBe(false)
    expect(isValidClientId('abc')).toBe(false)
    expect(isValidClientId(`${A}x`)).toBe(false)
  })
})

describe('resolveClientId', () => {
  it('prefers env, then the saved setting, then build time, then code', () => {
    expect(resolveClientId({ env: A, saved: B })).toEqual({ id: A, source: 'env' })
    expect(resolveClientId({ saved: B, build: A })).toEqual({ id: B, source: 'settings' })
    expect(resolveClientId({ saved: '', build: A, code: PLACEHOLDER })).toEqual({
      id: A,
      source: 'build',
    })
    expect(resolveClientId({ code: B })).toEqual({ id: B, source: 'code' })
  })

  it('ignores invalid values and the placeholder', () => {
    expect(resolveClientId({ env: 'nope', saved: '', build: '', code: PLACEHOLDER })).toEqual({
      id: '',
      source: 'none',
    })
  })
})

describe('settings schema', () => {
  it('accepts an empty or valid Client ID and rejects malformed ones', () => {
    expect(settingsPatchSchema.parse({ msClientId: ` ${A} ` })).toEqual({ msClientId: A })
    expect(settingsPatchSchema.parse({ msClientId: '' })).toEqual({ msClientId: '' })
    expect(() => settingsPatchSchema.parse({ msClientId: 'abc' })).toThrow()
  })
})
