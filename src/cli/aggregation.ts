/**
 * Activity Aggregation
 *
 * Groups similar activities and tracks mention counts.
 * Activities mentioned multiple times are MORE valuable, not duplicates.
 *
 * This is an orchestrator concern (CLI), not core library.
 */

import {
  type AggregatedActivity,
  type ClassifiedActivity,
  formatLocation,
  type GeocodedActivity,
  type SourceMessage
} from '../types.js'

/**
 * Normalize a string for comparison (lowercase, trim, collapse whitespace).
 */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Calculate Levenshtein distance between two strings.
 * Used for fuzzy matching of activity names.
 */
function levenshteinDistance(a: string, b: string): number {
  // Initialize matrix with proper typing to avoid non-null assertions
  const matrix: number[][] = Array.from({ length: b.length + 1 }, (_, i) =>
    Array.from({ length: a.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )

  for (let i = 1; i <= b.length; i++) {
    const row = matrix[i]
    const prevRow = matrix[i - 1]
    if (!row || !prevRow) continue

    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1
      const substitution = (prevRow[j - 1] ?? 0) + cost
      const insertion = (row[j - 1] ?? 0) + 1
      const deletion = (prevRow[j] ?? 0) + 1
      row[j] = Math.min(substitution, insertion, deletion)
    }
  }

  const lastRow = matrix[b.length]
  return lastRow ? (lastRow[a.length] ?? 0) : 0
}

/**
 * Calculate similarity ratio between two strings (0.0 to 1.0).
 */
function similarity(a: string, b: string): number {
  const normA = normalizeString(a)
  const normB = normalizeString(b)

  if (normA === normB) return 1.0
  if (normA.length === 0 || normB.length === 0) return 0.0

  const distance = levenshteinDistance(normA, normB)
  const maxLength = Math.max(normA.length, normB.length)

  return 1 - distance / maxLength
}

/**
 * Check if two activities should be grouped together.
 *
 * Matching criteria (in priority order):
 * 1. Exact location match (case-insensitive) - e.g., "Queenstown" appears twice
 * 2. High activity name similarity (>= 0.8) - e.g., "pottery class" vs "pottery classes"
 */
function shouldGroup(a: ClassifiedActivity, b: ClassifiedActivity): boolean {
  // Exact location match (if both have locations)
  const locA = formatLocation(a)
  const locB = formatLocation(b)
  if (locA && locB) {
    if (normalizeString(locA) === normalizeString(locB)) {
      return true
    }
  }

  // High activity name similarity
  if (similarity(a.activity, b.activity) >= 0.8) {
    return true
  }

  return false
}

/**
 * Create a SourceMessage from an activity.
 */
function toSourceMessage(activity: ClassifiedActivity): SourceMessage {
  return {
    messageId: activity.messageId,
    content: activity.originalMessage,
    sender: activity.sender,
    timestamp: activity.timestamp
  }
}

/**
 * Aggregate similar activities into groups with mention counts.
 *
 * @param activities Individual classified activities
 * @returns Aggregated activities with mention counts and source messages
 */
export function aggregateActivities<T extends ClassifiedActivity>(
  activities: readonly T[]
): AggregatedActivity[] {
  if (activities.length === 0) return []

  // Track which activities have been grouped
  const grouped = new Set<number>()
  const result: AggregatedActivity[] = []

  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i]
    if (!activity) continue

    // Skip if already grouped
    if (grouped.has(i)) continue

    // Find all matching activities
    const matches: T[] = [activity]
    const matchIndices: number[] = [i]

    for (let j = i + 1; j < activities.length; j++) {
      if (grouped.has(j)) continue

      const other = activities[j]
      if (other && shouldGroup(activity, other)) {
        matches.push(other)
        matchIndices.push(j)
      }
    }

    // Mark all as grouped
    for (const idx of matchIndices) {
      grouped.add(idx)
    }

    // Sort matches by timestamp to get first/last
    const sortedMatches = [...matches].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    const firstMention = sortedMatches[0]
    const lastMention = sortedMatches[sortedMatches.length - 1]
    if (!firstMention || !lastMention) continue

    // Create aggregated activity using the most recent mention as base
    // (most recent likely has most relevant details)
    const aggregated: AggregatedActivity = {
      ...lastMention,
      mentionCount: matches.length,
      firstMentionedAt: firstMention.timestamp,
      lastMentionedAt: lastMention.timestamp,
      sourceMessages: sortedMatches.map(toSourceMessage)
    }

    result.push(aggregated)
  }

  // Sort by mention count (descending) - "most wanted" first
  return result.sort((a, b) => b.mentionCount - a.mentionCount)
}

/**
 * Aggregate geocoded activities.
 * Convenience wrapper that preserves geocoding information.
 */
export function aggregateGeocodedActivities(
  activities: readonly GeocodedActivity[]
): (AggregatedActivity & Partial<GeocodedActivity>)[] {
  return aggregateActivities(activities).map((agg) => {
    // Find the original geocoded activity to get coordinates
    const original = activities.find((a) => a.messageId === agg.messageId)
    if (original && original.latitude !== undefined) {
      return {
        ...agg,
        latitude: original.latitude,
        longitude: original.longitude,
        formattedAddress: original.formattedAddress,
        placeId: original.placeId,
        geocodeSource: original.geocodeSource
      }
    }
    return agg
  })
}

/**
 * Filter aggregated activities by minimum mention count.
 */
export function filterByMentionCount(
  activities: readonly AggregatedActivity[],
  minCount: number
): AggregatedActivity[] {
  return activities.filter((a) => a.mentionCount >= minCount)
}

/**
 * Get "most wanted" activities - those mentioned multiple times.
 */
export function getMostWanted(
  activities: readonly AggregatedActivity[],
  limit = 10
): AggregatedActivity[] {
  return activities.filter((a) => a.mentionCount > 1).slice(0, limit)
}
