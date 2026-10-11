export type PluralForms = { one: string; few: string; other: string }
export type Dict = { [key: string]: string | PluralForms | Dict }

type Join<K extends string, P extends string> = `${K}.${P}`

/** Dot-separated keys pointing at plain strings. */
export type StringKeys<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends PluralForms
      ? never
      : Join<K, StringKeys<T[K]>>
}[keyof T & string]

/** Dot-separated keys pointing at plural forms. */
export type PluralKeys<T> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends PluralForms
      ? K
      : Join<K, PluralKeys<T[K]>>
}[keyof T & string]
