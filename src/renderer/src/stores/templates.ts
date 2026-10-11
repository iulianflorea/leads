import { create } from 'zustand'
import type { Template } from '@shared/schemas/template'
import { call, subscribe } from '@renderer/lib/api'
import { toast } from './toast'

interface TemplatesState {
  templates: Template[]
  extras: string[]
  loaded: boolean
  /** Lead used for previews across the app (null = sample data). */
  previewLead: { id: number; label: string } | null
  load(): Promise<void>
  replace(template: Template): void
  setPreviewLead(lead: { id: number; label: string } | null): void
}

export const useTemplates = create<TemplatesState>((set, get) => ({
  templates: [],
  extras: [],
  loaded: false,
  previewLead: null,
  async load() {
    try {
      const [templates, extras] = await Promise.all([
        call('templates:list'),
        call('templates:variables'),
      ])
      set({ templates, extras, loaded: true })
    } catch (error) {
      toast.error(error)
    }
  },
  replace(template) {
    set({ templates: get().templates.map((x) => (x.id === template.id ? template : x)) })
  },
  setPreviewLead(previewLead) {
    set({ previewLead })
  },
}))

subscribe('data:changed', ({ scope }) => {
  const s = useTemplates.getState()
  if (s.loaded && (scope.includes('templates') || scope.includes('leads'))) void s.load()
})
