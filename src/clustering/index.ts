/**
 * Semantic Clustering Module
 *
 * Groups near-identical activity suggestions into single entries with multiple instances.
 * Runs AFTER AI classification, using the rich structured output.
 *
 * Three goals:
 * 1. Clustering - Group "Go hiking" + "Let's hike" + "Do a hike" → 1 entry
 * 2. Filtering - Remove noise, empty entries, non-activities
 * 3. Error Correction - Fix AI classification mistakes via semantic similarity
 *
 * @example
 * ```typescript
 * const result = await clusterSuggestions(classifiedSuggestions)
 * console.log(result.clusters)  // Grouped activities
 * console.log(result.filtered)  // Removed as noise
 * ```
 */

import type { ClassifiedSuggestion } from '../types/classifier.js'
import { extractTuple, isEmptyTuple, type SemanticTuple } from './extract-tuple.js'
import { tuplesMatch } from './match-tuples.js'

/**
 * A single cluster of semantically equivalent activities.
 */
export interface SuggestionCluster {
  /** The best representative for this cluster (highest confidence). */
  readonly representative: ClassifiedSuggestion
  /** All suggestions in this cluster, including the representative. */
  readonly instances: readonly ClassifiedSuggestion[]
  /** Number of instances in this cluster. */
  readonly instanceCount: number
  /** Earliest mention timestamp. */
  readonly firstMentioned: Date
  /** Latest mention timestamp. */
  readonly lastMentioned: Date
  /** All unique senders who mentioned this activity. */
  readonly allSenders: readonly string[]
  /** The semantic tuple for this cluster. */
  readonly tuple: SemanticTuple
}

/**
 * Result of clustering suggestions.
 */
export interface ClusterResult {
  /** Clusters of related activities (sorted by instance count, descending). */
  readonly clusters: readonly SuggestionCluster[]
  /** Suggestions filtered out as noise (empty tuples, no semantic content). */
  readonly filtered: readonly ClassifiedSuggestion[]
}

/**
 * Configuration for clustering.
 */
export interface ClusterConfig {
  /**
   * Minimum activity score to include (default: 0).
   * Suggestions below this threshold are filtered.
   */
  readonly minActivityScore?: number
}

/**
 * Internal structure for tracking suggestions with their tuples.
 */
interface SuggestionWithTuple {
  readonly suggestion: ClassifiedSuggestion
  readonly tuple: SemanticTuple
}

/**
 * Select the best representative from a list of suggestions.
 * Prefers higher confidence, then higher activity score.
 * @throws Error if suggestions array is empty
 */
function selectRepresentative(suggestions: readonly ClassifiedSuggestion[]): ClassifiedSuggestion {
  const sorted = [...suggestions].sort((a, b) => {
    // Higher confidence first
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    // Then higher activity score
    return b.activityScore - a.activityScore
  })

  const first = sorted[0]
  if (!first) {
    throw new Error('selectRepresentative called with empty array')
  }
  return first
}

/**
 * Cluster semantically similar suggestions together.
 *
 * @param suggestions - Classified suggestions from AI
 * @param config - Optional clustering configuration
 * @returns Clustered result with clusters and filtered items
 *
 * @example
 * ```typescript
 * const result = await clusterSuggestions(suggestions)
 *
 * // Show clusters with multiple mentions
 * for (const cluster of result.clusters) {
 *   if (cluster.instanceCount > 1) {
 *     console.log(`${cluster.instanceCount}x: ${cluster.representative.activity}`)
 *   }
 * }
 * ```
 */
export async function clusterSuggestions(
  suggestions: readonly ClassifiedSuggestion[],
  config: ClusterConfig = {}
): Promise<ClusterResult> {
  const { minActivityScore = 0 } = config

  // Extract tuples for all suggestions
  const items: SuggestionWithTuple[] = await Promise.all(
    suggestions.map(async (suggestion) => ({
      suggestion,
      tuple: await extractTuple(suggestion.activity, suggestion.location)
    }))
  )

  // Separate into valid and filtered
  const filtered: ClassifiedSuggestion[] = []
  const valid: SuggestionWithTuple[] = []

  for (const item of items) {
    // Filter empty tuples (no semantic content)
    if (isEmptyTuple(item.tuple)) {
      filtered.push(item.suggestion)
      continue
    }

    // Filter by activity score
    if (item.suggestion.activityScore < minActivityScore) {
      filtered.push(item.suggestion)
      continue
    }

    valid.push(item)
  }

  // Build clusters using pairwise matching
  const clusters: SuggestionCluster[] = []
  const clustered = new Set<number>()

  for (let i = 0; i < valid.length; i++) {
    if (clustered.has(i)) continue

    const baseItem = valid[i]
    if (!baseItem) continue

    const clusterItems: SuggestionWithTuple[] = [baseItem]
    clustered.add(i)

    // Find all matching items
    for (let j = i + 1; j < valid.length; j++) {
      if (clustered.has(j)) continue

      const candidateItem = valid[j]
      if (candidateItem && tuplesMatch(baseItem.tuple, candidateItem.tuple)) {
        clusterItems.push(candidateItem)
        clustered.add(j)
      }
    }

    // Build the cluster
    const instances = clusterItems.map((item) => item.suggestion)
    const representative = selectRepresentative(instances)
    const timestamps = instances.map((s) => s.timestamp)
    const senders = [...new Set(instances.map((s) => s.sender))]

    clusters.push({
      representative,
      instances,
      instanceCount: instances.length,
      firstMentioned: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
      lastMentioned: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
      allSenders: senders,
      tuple: baseItem.tuple
    })
  }

  // Sort clusters by instance count (descending), then by first mentioned (ascending)
  clusters.sort((a, b) => {
    if (b.instanceCount !== a.instanceCount) return b.instanceCount - a.instanceCount
    return a.firstMentioned.getTime() - b.firstMentioned.getTime()
  })

  return { clusters, filtered }
}

// Re-export useful types and functions
export { extractTuple, formatTuple, isEmptyTuple, type SemanticTuple } from './extract-tuple.js'
export { arraysIntersect, tupleSimilarity, tuplesMatch } from './match-tuples.js'
