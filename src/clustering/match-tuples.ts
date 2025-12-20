/**
 * Tuple Matching for Semantic Clustering
 *
 * Compares semantic tuples to determine if two activities should cluster together.
 *
 * Matching rules:
 * - Nouns: null = wildcard (matches anything), otherwise check intersection
 * - Verbs: null = wildcard (matches anything), otherwise check intersection
 * - Location: STRICT match (null only matches null)
 *
 * Critical rule: If BOTH tuples have verbs and they don't intersect → NO MATCH
 * This prevents "Ride a bike" from matching "Fix a bike".
 */

import type { SemanticTuple } from './extract-tuple.js'

/**
 * Check if two arrays have any intersection (at least one common element).
 *
 * @param a - First array (or null for wildcard)
 * @param b - Second array (or null for wildcard)
 * @returns true if arrays intersect OR if either is null (wildcard)
 */
export function arraysIntersect(a: readonly string[] | null, b: readonly string[] | null): boolean {
  // null = wildcard, matches anything
  if (a === null || b === null) return true

  // Check for any common element
  return a.some((x) => b.includes(x))
}

/**
 * Check if two semantic tuples should match (cluster together).
 *
 * Matching rules:
 * 1. Nouns must intersect (or one/both is null)
 * 2. Verbs must intersect (or one/both is null)
 * 3. Location must match exactly (null only matches null)
 *
 * @param a - First semantic tuple
 * @param b - Second semantic tuple
 * @returns true if the tuples should cluster together
 *
 * Examples:
 * - "Go biking" ([bike], null, null) + "Ride a bike" ([bike], [ride], null) → MATCH
 *   (null verb is wildcard, nouns intersect, locations both null)
 *
 * - "Ride a bike" ([bike], [ride], null) + "Fix a bike" ([bike], [fix], null) → NO MATCH
 *   (nouns intersect, but verbs don't - both have verbs and they differ)
 *
 * - "Go kayaking" ([kayak], null, null) + "Go kayaking in Mexico" ([kayak], null, "mexico") → NO MATCH
 *   (nouns and verbs match, but location differs: null ≠ "mexico")
 */
export function tuplesMatch(a: SemanticTuple, b: SemanticTuple): boolean {
  // Nouns must intersect (or one is null/wildcard)
  if (!arraysIntersect(a.nouns, b.nouns)) return false

  // Verbs must intersect (or one is null/wildcard)
  if (!arraysIntersect(a.verbs, b.verbs)) return false

  // Location: STRICT match (null only matches null, specific must match specific)
  if (a.location !== b.location) return false

  return true
}

/**
 * Calculate a similarity score between two tuples.
 * Useful for ranking matches or finding the best cluster representative.
 *
 * @param a - First semantic tuple
 * @param b - Second semantic tuple
 * @returns Score from 0.0 (no match) to 1.0 (identical)
 */
export function tupleSimilarity(a: SemanticTuple, b: SemanticTuple): number {
  // Location must match exactly, or it's 0
  if (a.location !== b.location) return 0

  let score = 0
  let components = 0

  // Score noun intersection
  if (a.nouns && b.nouns) {
    const bNouns = b.nouns
    const intersection = a.nouns.filter((x) => bNouns.includes(x)).length
    const union = new Set([...a.nouns, ...bNouns]).size
    score += intersection / union
    components++
  } else if (a.nouns === null && b.nouns === null) {
    // Both null = perfect match for this component
    score += 1
    components++
  } else {
    // One null (wildcard) = partial match
    score += 0.5
    components++
  }

  // Score verb intersection
  if (a.verbs && b.verbs) {
    const bVerbs = b.verbs
    const intersection = a.verbs.filter((x) => bVerbs.includes(x)).length
    const union = new Set([...a.verbs, ...bVerbs]).size
    score += intersection / union
    components++
  } else if (a.verbs === null && b.verbs === null) {
    score += 1
    components++
  } else {
    score += 0.5
    components++
  }

  // Location matched (already checked above)
  score += 1
  components++

  return components > 0 ? score / components : 0
}
