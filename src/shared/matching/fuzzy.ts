/**
 * Optimal string alignment distance (Damerau-Levenshtein without substring moves):
 * insertions, deletions, substitutions and adjacent transpositions ("emial") cost 1.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const rows = a.length + 1
  const cols = b.length + 1
  const d = new Array<number>(rows * cols)
  for (let i = 0; i < rows; i++) d[i * cols] = i
  for (let j = 0; j < cols; j++) d[j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(
        d[(i - 1) * cols + j]! + 1,
        d[i * cols + j - 1]! + 1,
        d[(i - 1) * cols + j - 1]! + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, d[(i - 2) * cols + j - 2]! + 1)
      }
      d[i * cols + j] = v
    }
  }
  return d[rows * cols - 1]!
}

/** Similarity in [0, 1] based on edit distance relative to the longer string. */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  return 1 - editDistance(a, b) / Math.max(a.length, b.length)
}
