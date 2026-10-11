import { nativeTheme } from 'electron'
import {
  defaultSettings,
  settingsSchema,
  type Settings,
  type SettingsPatch,
} from '@shared/schemas/settings'

export interface SettingsStore {
  load(): Partial<Settings>
  save(settings: Settings): void
}

/** Settings with defaults, persisted through a pluggable store. */
export class SettingsService {
  private current: Settings

  constructor(private readonly store: SettingsStore) {
    const parsed = settingsSchema.safeParse({ ...defaultSettings, ...store.load() })
    this.current = parsed.success ? parsed.data : defaultSettings
    this.applySideEffects()
  }

  get(): Settings {
    return this.current
  }

  update(patch: SettingsPatch): Settings {
    const next = settingsSchema.parse({
      ...this.current,
      ...patch,
      smtp: { ...this.current.smtp, ...(patch.smtp ?? {}) },
    })
    this.current = next
    this.store.save(next)
    this.applySideEffects()
    return next
  }

  private applySideEffects(): void {
    nativeTheme.themeSource = this.current.theme
  }
}

export class MemorySettingsStore implements SettingsStore {
  private data: Partial<Settings> = {}
  load(): Partial<Settings> {
    return this.data
  }
  save(settings: Settings): void {
    this.data = settings
  }
}
