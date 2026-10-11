import { baseVariables, type BaseVariable } from '@shared/template/render'
import { t, type MessageKey } from './i18n'

export interface VariableOption {
  /** Text inserted between the braces, e.g. "prenume" or "extra.Oraș". */
  key: string
  label: string
  group: 'base' | 'extra'
}

const baseLabels: Record<BaseVariable, MessageKey> = {
  nume: 'fields.name',
  prenume: 'fields.firstName',
  email: 'fields.email',
  telefon: 'fields.phone',
  adresa: 'fields.address',
  produs: 'fields.product',
}

export function variableOptions(extras: string[]): VariableOption[] {
  return [
    ...baseVariables.map((key) => ({ key, label: t(baseLabels[key]), group: 'base' as const })),
    ...extras.map((name) => ({ key: `extra.${name}`, label: name, group: 'extra' as const })),
  ]
}

export function filterVariables(options: VariableOption[], query: string): VariableOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter((o) => o.key.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
}
