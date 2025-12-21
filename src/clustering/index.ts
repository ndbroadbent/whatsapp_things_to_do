/**
 * Semantic Clustering Module
 *
 * Groups identical activities into single entries with multiple instances.
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
 * const result = clusterActivities(classifiedActivities)
 * console.log(result.clusters)  // Grouped activities
 * console.log(result.filtered)  // Removed as noise
 * ```
 */

import type { ClassifiedActivity } from '../types/classifier.js'

/**
 * A single cluster of semantically equivalent activities.
 */
export interface ActivityCluster {
  /** The best representative for this cluster (highest confidence). */
  readonly representative: ClassifiedActivity
  /** All activities in this cluster, including the representative. */
  readonly instances: readonly ClassifiedActivity[]
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
 * Result of clustering activities.
 */
export interface ClusterResult {
  /** Clusters of related activities (sorted by instance count, descending). */
  readonly clusters: readonly ActivityCluster[]
  /** Activities filtered out as noise (low activity score, etc). */
  readonly filtered: readonly ClassifiedActivity[]
}

/**
 * Configuration for clustering.
 */
export interface ClusterConfig {
  /**
   * Minimum activity score to include (default: 0).
   * Activities below this threshold are filtered.
   */
  readonly minActivityScore?: number
}

/**
 * Generate a clustering key from normalized fields.
 * Case-insensitive comparison.
 */
function getClusterKey(a: ClassifiedActivity): string {
  return [
    a.action?.toLowerCase() ?? '',
    a.object?.toLowerCase() ?? '',
    a.venue?.toLowerCase() ?? '',
    a.city?.toLowerCase() ?? '',
    a.country?.toLowerCase() ?? ''
  ].join('|')
}

/**
 * Select the best representative from a list of activities.
 * Prefers higher confidence, then higher activity score.
 * @throws Error if activities array is empty
 */
function selectRepresentative(activities: readonly ClassifiedActivity[]): ClassifiedActivity {
  const sorted = [...activities].sort((a, b) => {
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
 * Build a cluster from a group of activities.
 */
function buildCluster(
  activities: readonly ClassifiedActivity[],
  clusterKey: string
): ActivityCluster {
  const representative = selectRepresentative(activities)
  const timestamps = activities.map((a) => a.timestamp)
  const senders = [...new Set(activities.map((a) => a.sender))]

  return {
    representative,
    instances: activities,
    instanceCount: activities.length,
    firstMentioned: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
    lastMentioned: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
    allSenders: senders,
    clusterKey
  }
}

/**
 * Cluster activities by matching fields.
 *
 * - Complete entries: cluster by normalized fields (action, object, venue, city, country)
 * - Complex entries: cluster by exact activity title
 *
 * @param activities - Classified activities from AI
 * @param config - Optional clustering configuration
 * @returns Clustered result with clusters and filtered items
 *
 * @example
 * ```typescript
 * const result = clusterActivities(activities)
 *
 * // Show clusters with multiple mentions
 * for (const cluster of result.clusters) {
 *   if (cluster.instanceCount > 1) {
 *     console.log(`${cluster.instanceCount}x: ${cluster.representative.activity}`)
 *   }
 * }
 * ```
 */
export function clusterActivities(
  activities: readonly ClassifiedActivity[],
  config: ClusterConfig = {}
): ClusterResult {
  const { minActivityScore = 0 } = config

  // Separate into valid and filtered
  const filtered: ClassifiedActivity[] = []
  const valid: ClassifiedActivity[] = []

  for (const activity of activities) {
    // Filter by activity score
    if (activity.activityScore < minActivityScore) {
      filtered.push(activity)
      continue
    }

    valid.push(activity)
  }

  // Separate complete and complex entries
  const complete = valid.filter((a) => a.isComplete)
  const complex = valid.filter((a) => !a.isComplete)

  // Group complete entries by normalized fields (case-insensitive)
  const completeGroups = new Map<string, ClassifiedActivity[]>()
  for (const a of complete) {
    const key = getClusterKey(a)
    const group = completeGroups.get(key) ?? []
    group.push(a)
    completeGroups.set(key, group)
  }

  // Group complex entries by exact title (case-insensitive)
  const complexGroups = new Map<string, ClassifiedActivity[]>()
  for (const a of complex) {
    const key = a.activity.toLowerCase()
    const group = complexGroups.get(key) ?? []
    group.push(a)
    complexGroups.set(key, group)
  }

  // Build clusters from both groups
  const clusters: ActivityCluster[] = []

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
