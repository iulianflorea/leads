import { create } from 'zustand'

export type Screen = 'leads' | 'import' | 'products' | 'templates' | 'history' | 'settings'

interface NavState {
  screen: Screen
  /** Optional parameters passed to a screen (e.g. preselected ids). */
  params: Record<string, unknown>
  paletteOpen: boolean
  go(screen: Screen, params?: Record<string, unknown>): void
  setPaletteOpen(open: boolean): void
}

export const useNav = create<NavState>((set) => ({
  screen: 'leads',
  params: {},
  paletteOpen: false,
  go: (screen, params = {}) => set({ screen, params, paletteOpen: false }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}))
