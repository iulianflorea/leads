/** Lowercase, strip diacritics (incl. Romanian ş/ţ cedilla forms) and trim. */
export function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[şș]/gi, 's')
    .replace(/[ţț]/gi, 't')
    .toLowerCase()
    .trim()
}

/** Folded text with every non-alphanumeric character removed ("Pompă-Căldură 9kW" -> "pompacaldura9kw"). */
export function normalizeKey(input: string): string {
  return foldText(input).replace(/[^a-z0-9]+/g, '')
}

/** Folded text reduced to space-separated alphanumeric words. */
export function normalizeWords(input: string): string {
  return foldText(input)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
