import { ro } from './ro'
import type { Dict, PluralForms, PluralKeys, StringKeys } from './types'

export type Messages = typeof ro
export type MessageKey = StringKeys<Messages>
export type PluralKey = PluralKeys<Messages>
export type Language = 'ro'
export type Params = Record<string, string | number>

export const languages: Record<Language, { label: string; messages: Messages }> = {
  ro: { label: 'Română', messages: ro },
}

let current: Language = 'ro'

export function setLanguage(lang: Language): void {
  current = lang
}

export function getLanguage(): Language {
  return current
}

function lookup(key: string): unknown {
  let node: unknown = languages[current].messages
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in node) {
      node = (node as Dict)[part]
    } else {
      return undefined
    }
  }
  return node
}

function interpolate(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

export function t(key: MessageKey, params?: Params): string {
  const value = lookup(key)
  return typeof value === 'string' ? interpolate(value, params) : key
}

/** Plural-aware translation; `{count}` is always available in the message. */
export function tp(key: PluralKey, count: number, params?: Params): string {
  const forms = lookup(key) as PluralForms | undefined
  if (!forms) return key
  const rule = new Intl.PluralRules(current).select(count)
  const text = rule === 'one' ? forms.one : rule === 'few' ? forms.few : forms.other
  return interpolate(text, { count, ...params })
}
