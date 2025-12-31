/**
 * Semantic Clustering Module
 *
 * Groups identical activities into single entries with multiple instances.
 * Clusters by normalized fields (mediaKey, placeName/placeQuery, city, country).
 *
 * @example
 * ```typescript
 * const result = clusterActivities(classifiedActivities)
 * console.log(result.clusters)  // Grouped activities
 * console.log(result.filtered)  // Removed as noise
 * ```
 */

import type { ClassifiedActivity } from '../types/classifier'

/**
 * A single cluster of semantically equivalent activities.
 */
interface ActivityCluster {
  /** The best representative for this cluster (highest score). */
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
interface ClusterResult {
  /** Clusters of related activities (sorted by instance count, descending). */
  readonly clusters: readonly ActivityCluster[]
  /** Activities filtered out (reserved for future use). */
  readonly filtered: readonly ClassifiedActivity[]
}

/**
 * Configuration for clustering.
 * Currently empty - reserved for future options.
 */
type ClusterConfig = Record<string, never>

/**
 * Generate a clustering key from normalized fields.
 * Case-insensitive comparison.
 */
function getClusterKey(a: ClassifiedActivity): string {
  const place = a.placeName || a.placeQuery
  return [
    a.image.mediaKey?.toLowerCase() ?? '',
    place?.toLowerCase() ?? '',
    a.city?.toLowerCase() ?? '',
    a.country?.toLowerCase() ?? ''
  ].join('|')
}

/**
 * Select the best representative from a list of activities.
 * Prefers higher score.
 * @throws Error if activities array is empty
 */
function selectRepresentative(activities: readonly ClassifiedActivity[]): ClassifiedActivity {
  const sorted = [...activities].sort((a, b) => {
    // Higher score first
    return b.score - a.score
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
  // Collect all timestamps from all messages across all activities
  const timestamps = activities.flatMap((a) => a.messages.map((m) => m.timestamp))
  // Collect all unique senders from all messages across all activities
  const senders = [...new Set(activities.flatMap((a) => a.messages.map((m) => m.sender)))]

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
 * Groups by normalized fields (mediaKey, placeName/placeQuery, city, country).
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
  _config: ClusterConfig = {}
): ClusterResult {
  // All activities are valid - no filtering
  const valid: ClassifiedActivity[] = [...activities]
  const filtered: ClassifiedActivity[] = []

  // Group all entries by normalized fields (case-insensitive)
  const groups = new Map<string, ClassifiedActivity[]>()
  for (const a of valid) {
    const key = getClusterKey(a)
    const group = groups.get(key) ?? []
    group.push(a)
    groups.set(key, group)
  }

  // Build clusters from groups
  const clusters: ActivityCluster[] = []

  for (const [key, group] of groups) {
    clusters.push(buildCluster(group, key))
  }

  // Sort clusters by instance count (descending), then by first mentioned (ascending)
  clusters.sort((a, b) => {
    if (b.instanceCount !== a.instanceCount) return b.instanceCount - a.instanceCount
    return a.firstMentioned.getTime() - b.firstMentioned.getTime()
  })

  return { clusters, filtered }
}
