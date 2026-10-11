import { create } from 'zustand'
import type { Settings, SettingsPatch } from '@shared/schemas/settings'
import type { AppInfo } from '@shared/types'
import { call, subscribe } from '@renderer/lib/api'
import { toast } from './toast'

interface SettingsState {
  settings: Settings | null
  info: AppInfo | null
  load(): Promise<void>
  update(patch: SettingsPatch): Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  info: null,
  async load() {
    const [settings, info] = await Promise.all([call('settings:get'), call('app:getInfo')])
    set({ settings, info })
  },
  async update(patch) {
    try {
      set({ settings: await call('settings:update', patch) })
    } catch (error) {
      toast.error(error)
    }
  },
}))

subscribe('settings:changed', (settings) => useSettings.setState({ settings }))
