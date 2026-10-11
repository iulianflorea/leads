import { create } from 'zustand'
import type { LeadQuery, LeadRow, LeadSort } from '@shared/schemas/lead'
import { call, subscribe } from '@renderer/lib/api'
import { toast } from './toast'

export type LeadFilters = Required<Omit<LeadQuery, 'sort' | 'direction'>>

export const defaultFilters: LeadFilters = {
  search: '',
  listId: null,
  productId: null,
  status: null,
  hasPdf: null,
}

interface LeadsState {
  rows: LeadRow[]
  loading: boolean
  loaded: boolean
  filters: LeadFilters
  sort: LeadSort
  direction: 'asc' | 'desc'
  selected: Set<number>
  openId: number | null
  fetch(): Promise<void>
  setFilters(patch: Partial<LeadFilters>): void
  resetFilters(): void
  setSort(sort: LeadSort): void
  toggle(id: number, value?: boolean): void
  selectRange(ids: number[], value: boolean): void
  clearSelection(): void
  open(id: number | null): void
}

let seq = 0

export const useLeads = create<LeadsState>((set, get) => ({
  rows: [],
  loading: false,
  loaded: false,
  filters: defaultFilters,
  sort: 'createdAt',
  direction: 'desc',
  selected: new Set(),
  openId: null,

  async fetch() {
    const id = ++seq
    set({ loading: true })
    try {
      const { filters, sort, direction } = get()
      const rows = await call('leads:query', { ...filters, sort, direction })
      if (id !== seq) return // a newer query superseded this one
      const visible = new Set(rows.map((r) => r.id))
      const selected = new Set([...get().selected].filter((x) => visible.has(x)))
      set({ rows, selected, loaded: true })
    } catch (error) {
      toast.error(error)
    } finally {
      if (id === seq) set({ loading: false })
    }
  },

  setFilters(patch) {
    set({ filters: { ...get().filters, ...patch } })
    void get().fetch()
  },

  resetFilters() {
    set({ filters: defaultFilters })
    void get().fetch()
  },

  setSort(sort) {
    const { sort: current, direction } = get()
    set({
      sort,
      direction:
        current === sort
          ? direction === 'asc'
            ? 'desc'
            : 'asc'
          : sort === 'createdAt'
            ? 'desc'
            : 'asc',
    })
    void get().fetch()
  },

  toggle(id, value) {
    const selected = new Set(get().selected)
    const on = value ?? !selected.has(id)
    if (on) selected.add(id)
    else selected.delete(id)
    set({ selected })
  },

  selectRange(ids, value) {
    const selected = new Set(get().selected)
    for (const id of ids) {
      if (value) selected.add(id)
      else selected.delete(id)
    }
    set({ selected })
  },

  clearSelection() {
    set({ selected: new Set() })
  },

  open(openId) {
    set({ openId })
  },
}))

subscribe('data:changed', ({ scope }) => {
  const state = useLeads.getState()
  if (state.loaded && scope.some((s) => s === 'leads' || s === 'products' || s === 'sends')) {
    void state.fetch()
  }
})
