import { z } from 'zod'

export interface ProductSynonym {
  id: number
  value: string
}

export interface Product {
  id: number
  name: string
  active: boolean
  synonyms: ProductSynonym[]
  pdf: { name: string; size: number; missing: boolean } | null
  leadCount: number
  createdAt: string
}

export interface UnmatchedValue {
  value: string
  valueNorm: string
  leadCount: number
  suggestions: Array<{ productId: number; name: string; score: number }>
}

export interface IgnoredValue {
  value: string
  valueNorm: string
  leadCount: number
}

const name = z.string().trim().min(1).max(200)

export const productInputSchema = z.object({
  name,
  active: z.boolean().default(true),
  synonyms: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
})
export type ProductInput = z.input<typeof productInputSchema>

export const productPatchSchema = z
  .object({
    name,
    active: z.boolean(),
    synonyms: z.array(z.string().trim().min(1).max(200)).max(200),
  })
  .partial()

export const resolveValueSchema = z.object({
  value: z.string().min(1).max(1000),
  action: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('link'), productId: z.number().int() }),
    z.object({ kind: z.literal('create'), name }),
    z.object({ kind: z.literal('ignore') }),
  ]),
})
export type ResolveValueInput = z.input<typeof resolveValueSchema>
