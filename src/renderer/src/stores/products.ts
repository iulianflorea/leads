import { create } from 'zustand'
import type { IgnoredValue, Product, UnmatchedValue } from '@shared/schemas/product'
import { call, subscribe } from '@renderer/lib/api'
import { toast } from './toast'

interface ProductsState {
  products: Product[]
  unmatched: UnmatchedValue[]
  ignored: IgnoredValue[]
  loaded: boolean
  load(): Promise<void>
}

export const useProducts = create<ProductsState>((set) => ({
  products: [],
  unmatched: [],
  ignored: [],
  loaded: false,
  async load() {
    try {
      const [products, unmatched, ignored] = await Promise.all([
        call('products:list'),
        call('products:unmatched'),
        call('products:ignored'),
      ])
      set({ products, unmatched, ignored, loaded: true })
    } catch (error) {
      toast.error(error)
    }
  },
}))

subscribe('data:changed', ({ scope }) => {
  if (useProducts.getState().loaded && (scope.includes('products') || scope.includes('leads'))) {
    void useProducts.getState().load()
  }
})
