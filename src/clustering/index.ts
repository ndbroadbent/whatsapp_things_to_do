/**
 * Semantic Clustering Module
 *
 * Groups identical activity suggestions into single entries with multiple instances.
 *
 * Two clustering strategies:
 * 1. Complete entries (isComplete=true): Match on normalized fields (action, object, venue, city, country)
 * 2. Complex entries (isComplete=false): Match on exact activity title string
 *
 * Complete = structured fields fully capture the activity (e.g., "hike in Queenstown")
 * Complex = compound/lossy, title is the full representation (e.g., "Go to Iceland and see the aurora")
 *
 * @example
 * ```typescript
 * const result = clusterSuggestions(classifiedSuggestions)
 * console.log(result.clusters)  // Grouped activities
 * console.log(result.filtered)  // Removed as noise
 * ```
 */

import type { ClassifiedSuggestion } from '../types/classifier.js'

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
  /** The clustering key for this cluster. */
  readonly clusterKey: string
}

/**
 * Result of clustering suggestions.
 */
export interface ClusterResult {
  /** Clusters of related activities (sorted by instance count, descending). */
  readonly clusters: readonly SuggestionCluster[]
  /** Suggestions filtered out as noise (low activity score, etc). */
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
 * Generate a clustering key from normalized fields.
 * Case-insensitive comparison.
 */
function getClusterKey(s: ClassifiedSuggestion): string {
  return [
    s.action?.toLowerCase() ?? '',
    s.object?.toLowerCase() ?? '',
    s.venue?.toLowerCase() ?? '',
    s.city?.toLowerCase() ?? '',
    s.country?.toLowerCase() ?? ''
  ].join('|')
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
 * Build a cluster from a group of suggestions.
 */
function buildCluster(
  suggestions: readonly ClassifiedSuggestion[],
  clusterKey: string
): SuggestionCluster {
  const representative = selectRepresentative(suggestions)
  const timestamps = suggestions.map((s) => s.timestamp)
  const senders = [...new Set(suggestions.map((s) => s.sender))]

  return {
    representative,
    instances: suggestions,
    instanceCount: suggestions.length,
    firstMentioned: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
    lastMentioned: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
    allSenders: senders,
    clusterKey
  }
}

/**
 * Cluster suggestions by matching fields.
 *
 * - Complete entries: cluster by normalized fields (action, object, venue, city, country)
 * - Complex entries: cluster by exact activity title
 *
 * @param suggestions - Classified suggestions from AI
 * @param config - Optional clustering configuration
 * @returns Clustered result with clusters and filtered items
 *
 * @example
 * ```typescript
 * const result = clusterSuggestions(suggestions)
 *
 * // Show clusters with multiple mentions
 * for (const cluster of result.clusters) {
 *   if (cluster.instanceCount > 1) {
 *     console.log(`${cluster.instanceCount}x: ${cluster.representative.activity}`)
 *   }
 * }
 * ```
 */
export function clusterSuggestions(
  suggestions: readonly ClassifiedSuggestion[],
  config: ClusterConfig = {}
): ClusterResult {
  const { minActivityScore = 0 } = config

  // Separate into valid and filtered
  const filtered: ClassifiedSuggestion[] = []
  const valid: ClassifiedSuggestion[] = []

  for (const suggestion of suggestions) {
    // Filter by activity score
    if (suggestion.activityScore < minActivityScore) {
      filtered.push(suggestion)
      continue
    }

    valid.push(suggestion)
  }

  // Separate complete and complex entries
  const complete = valid.filter((s) => s.isComplete)
  const complex = valid.filter((s) => !s.isComplete)

  // Group complete entries by normalized fields (case-insensitive)
  const completeGroups = new Map<string, ClassifiedSuggestion[]>()
  for (const s of complete) {
    const key = getClusterKey(s)
    const group = completeGroups.get(key) ?? []
    group.push(s)
    completeGroups.set(key, group)
  }

  // Group complex entries by exact title (case-insensitive)
  const complexGroups = new Map<string, ClassifiedSuggestion[]>()
  for (const s of complex) {
    const key = s.activity.toLowerCase()
    const group = complexGroups.get(key) ?? []
    group.push(s)
    complexGroups.set(key, group)
  }

  // Build clusters from both groups
  const clusters: SuggestionCluster[] = []

  for (const [key, group] of completeGroups) {
    clusters.push(buildCluster(group, key))
  }

  for (const [key, group] of complexGroups) {
    clusters.push(buildCluster(group, key))
  }

  // Sort clusters by instance count (descending), then by first mentioned (ascending)
  clusters.sort((a, b) => {
    if (b.instanceCount !== a.instanceCount) return b.instanceCount - a.instanceCount
    return a.firstMentioned.getTime() - b.firstMentioned.getTime()
  })

  return { clusters, filtered }
}
