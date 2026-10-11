import { create } from 'zustand'
import type { ListSummary } from '@shared/schemas/lead'
import { call, subscribe } from '@renderer/lib/api'

interface ListsState {
  lists: ListSummary[]
  loaded: boolean
  load(): Promise<void>
}

export const useLists = create<ListsState>((set) => ({
  lists: [],
  loaded: false,
  async load() {
    set({ lists: await call('lists:list'), loaded: true })
  },
}))

subscribe('data:changed', ({ scope }) => {
  if (scope.includes('lists') && useLists.getState().loaded) void useLists.getState().load()
})
