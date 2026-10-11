import { foldText, normalizeWords } from '../matching/normalize'
import { similarity } from '../matching/fuzzy'
import {
  emptyMapping,
  fieldPriority,
  fieldSynonyms,
  targetFields,
  type ColumnMapping,
  type TargetField,
} from './fields'

const MIN_SCORE = 0.72

/** Scores how well a header matches a target field (0..1). */
export function scoreHeader(header: string, field: TargetField): number {
  const words = normalizeWords(header)
  if (!words) return 0
  const compact = words.replace(/ /g, '')
  let best = 0
  for (const synonym of fieldSynonyms[field]) {
    const synCompact = synonym.replace(/ /g, '')
    if (words === synonym || compact === synCompact) return 1
    // Whole-word containment: "Adresa de email client" contains "adresa de email".
    if (` ${words} `.includes(` ${synonym} `)) {
      best = Math.max(best, 0.8 + 0.15 * (synonym.length / words.length))
      continue
    }
    best = Math.max(best, similarity(compact, synCompact))
  }
  return best
}

/**
 * Suggests a mapping from spreadsheet headers to target fields. Each field and each
 * header is used at most once; pairs are assigned greedily by best score.
 */
export function detectColumns(headers: string[]): ColumnMapping {
  const pairs: Array<{ field: TargetField; header: string; score: number }> = []
  for (const header of headers) {
    if (!foldText(header)) continue
    for (const field of targetFields) {
      const score = scoreHeader(header, field)
      if (score >= MIN_SCORE) pairs.push({ field, header, score })
    }
  }
  pairs.sort(
    (a, b) => b.score - a.score || fieldPriority.indexOf(a.field) - fieldPriority.indexOf(b.field),
  )
  const mapping: ColumnMapping = { ...emptyMapping }
  const usedHeaders = new Set<string>()
  for (const p of pairs) {
    if (mapping[p.field] !== null || usedHeaders.has(p.header)) continue
    mapping[p.field] = p.header
    usedHeaders.add(p.header)
  }
  return mapping
}

/** Stable key for a set of headers, used to remember mappings between imports. */
export function headerSignature(headers: string[]): string {
  return headers
    .map((h) => normalizeWords(h))
    .filter(Boolean)
    .sort()
    .join('|')
}

/** Keeps a saved mapping only where its headers still exist in the file. */
export function applySavedMapping(saved: ColumnMapping, headers: string[]): ColumnMapping {
  const present = new Set(headers)
  const out: ColumnMapping = { ...emptyMapping }
  for (const field of targetFields) {
    const h = saved[field]
    out[field] = h && present.has(h) ? h : null
  }
  return out
}
