import { normalizeKey } from './normalize'
import { similarity } from './fuzzy'

export interface MatchableProduct {
  id: number
  name: string
  synonyms: string[]
}

export interface ProductMatch {
  productId: number
  score: number
  /** How the match was found. */
  kind: 'exact' | 'contains' | 'fuzzy'
}

/** Minimum similarity for an automatic fuzzy match. */
export const FUZZY_THRESHOLD = 0.8
/** Candidate keys shorter than this never match by containment (avoids "kit" in "kitchen"). */
const MIN_CONTAINED_LENGTH = 6

interface Entry {
  key: string
  productId: number
}

/**
 * Resolves free-text product values from leads to products:
 * 1) exact match on the normalized name or a synonym,
 * 2) the value contains a name/synonym ("Panouri fotovoltaice 5kW" -> "Panouri fotovoltaice"),
 * 3) fuzzy similarity above the threshold ("Pompă căldură" -> "Pompă de căldură").
 */
export class ProductMatcher {
  private readonly exact = new Map<string, number>()
  private readonly entries: Entry[] = []

  constructor(
    products: MatchableProduct[],
    private readonly threshold = FUZZY_THRESHOLD,
  ) {
    for (const p of products) {
      for (const label of [p.name, ...p.synonyms]) {
        const key = normalizeKey(label)
        if (!key || this.exact.has(key)) continue
        this.exact.set(key, p.id)
        this.entries.push({ key, productId: p.id })
      }
    }
  }

  match(value: string): ProductMatch | null {
    const key = normalizeKey(value)
    if (!key) return null
    const exact = this.exact.get(key)
    if (exact !== undefined) return { productId: exact, score: 1, kind: 'exact' }

    // Longest contained key wins, so "pompa de caldura aer apa" prefers the most specific product.
    let contained: Entry | null = null
    for (const e of this.entries) {
      if (e.key.length >= MIN_CONTAINED_LENGTH && key.includes(e.key)) {
        if (!contained || e.key.length > contained.key.length) contained = e
      }
    }
    if (contained) return { productId: contained.productId, score: 0.9, kind: 'contains' }

    const best = this.rank(key)[0]
    return best && best.score >= this.threshold ? { ...best, kind: 'fuzzy' } : null
  }

  /** Best candidates per product for a value, for "did you mean" suggestions. */
  suggest(value: string, limit = 3, minScore = 0.45): Array<{ productId: number; score: number }> {
    const key = normalizeKey(value)
    if (!key) return []
    return this.rank(key)
      .filter((c) => c.score >= minScore)
      .slice(0, limit)
  }

  private rank(key: string): Array<{ productId: number; score: number }> {
    const best = new Map<number, number>()
    for (const e of this.entries) {
      let score = similarity(key, e.key)
      // Partial containment the other way round ("panouri" inside "panourifotovoltaice") is a hint, not a match.
      if (e.key.includes(key) && key.length >= 4)
        score = Math.max(score, 0.6 + 0.3 * (key.length / e.key.length))
      if (score > (best.get(e.productId) ?? 0)) best.set(e.productId, score)
    }
    return [...best.entries()]
      .map(([productId, score]) => ({ productId, score }))
      .sort((a, b) => b.score - a.score)
  }
}
