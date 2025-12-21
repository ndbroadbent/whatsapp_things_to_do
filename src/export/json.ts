/**
 * JSON Export
 *
 * Export activities to JSON format with metadata.
 */

import type { ExportMetadata, GeocodedActivity } from '../types.js'

interface JsonExport {
  metadata: ExportMetadata
  activities: GeocodedActivity[]
}

/**
 * Export activities to JSON format.
 *
 * @param activities Geocoded activities to export
 * @param metadata Export metadata
 * @returns JSON string
 */
export function exportToJSON(
  activities: readonly GeocodedActivity[],
  metadata: Partial<ExportMetadata> = {}
): string {
  const geocodedCount = activities.filter(
    (a) => a.latitude !== undefined && a.longitude !== undefined
  ).length

  const exportData: JsonExport = {
    metadata: {
      version: metadata.version ?? '1.0.0',
      generatedAt: metadata.generatedAt ?? new Date(),
      inputFile: metadata.inputFile,
      messageCount: metadata.messageCount ?? 0,
      activityCount: activities.length,
      geocodedCount
    },
    activities: [...activities]
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Parse JSON export back to activities.
 */
export function parseJSON(json: string): JsonExport {
  const data = JSON.parse(json) as JsonExport

  // Convert date strings back to Date objects
  for (const activity of data.activities) {
    if (typeof activity.timestamp === 'string') {
      // Use Object.assign to work around readonly
      Object.assign(activity, { timestamp: new Date(activity.timestamp) })
    }
  }

  if (typeof data.metadata.generatedAt === 'string') {
    Object.assign(data.metadata, { generatedAt: new Date(data.metadata.generatedAt) })
  }

  return data
}
