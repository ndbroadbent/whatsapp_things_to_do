/**
 * JSON Export
 *
 * Export suggestions to JSON format with metadata.
 */

import type { ExportMetadata, GeocodedSuggestion } from '../types.js'

interface JsonExport {
  metadata: ExportMetadata
  suggestions: GeocodedSuggestion[]
}

/**
 * Export suggestions to JSON format.
 *
 * @param suggestions Geocoded suggestions to export
 * @param metadata Export metadata
 * @returns JSON string
 */
export function exportToJSON(
  suggestions: readonly GeocodedSuggestion[],
  metadata: Partial<ExportMetadata> = {}
): string {
  const geocodedCount = suggestions.filter(
    (s) => s.latitude !== undefined && s.longitude !== undefined
  ).length

  const exportData: JsonExport = {
    metadata: {
      version: metadata.version ?? '1.0.0',
      generatedAt: metadata.generatedAt ?? new Date(),
      inputFile: metadata.inputFile,
      messageCount: metadata.messageCount ?? 0,
      suggestionCount: suggestions.length,
      geocodedCount
    },
    suggestions: [...suggestions]
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Parse JSON export back to suggestions.
 */
export function parseJSON(json: string): JsonExport {
  const data = JSON.parse(json) as JsonExport

  // Convert date strings back to Date objects
  for (const suggestion of data.suggestions) {
    if (typeof suggestion.timestamp === 'string') {
      // Use Object.assign to work around readonly
      Object.assign(suggestion, { timestamp: new Date(suggestion.timestamp) })
    }
  }

  if (typeof data.metadata.generatedAt === 'string') {
    Object.assign(data.metadata, { generatedAt: new Date(data.metadata.generatedAt) })
  }

  return data
}
