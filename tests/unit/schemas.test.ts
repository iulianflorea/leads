import { describe, expect, it } from 'vitest'
import { leadInputSchema, leadPatchSchema } from '@shared/schemas/lead'
import { settingsPatchSchema } from '@shared/schemas/settings'

describe('patch schemas', () => {
  it('lead patch keeps only provided fields', () => {
    expect(leadPatchSchema.parse({ phone: ' 0700 ' })).toEqual({ phone: '0700' })
  })
  it('lead input fills defaults', () => {
    expect(leadInputSchema.parse({ name: 'Ana' })).toMatchObject({
      name: 'Ana',
      email: '',
      extra: {},
    })
  })
  it('settings patch keeps only provided fields', () => {
    expect(settingsPatchSchema.parse({ theme: 'dark' })).toEqual({ theme: 'dark' })
  })
})
