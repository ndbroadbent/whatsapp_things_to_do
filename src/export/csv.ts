/**
 * CSV Export
 *
 * Export suggestions to CSV format.
 */

import { formatLocation, type GeocodedSuggestion } from '../types.js'
import { formatDate, formatTime, googleMapsLink } from './utils.js'

const CSV_COLUMNS = [
  'id',
  'date',
  'time',
  'sender',
  'original_message',
  'activity',
  'location',
  'latitude',
  'longitude',
  'confidence',
  'activity_score',
  'category',
  'google_maps_link',
  'status'
] as const

/**
 * Escape a value for CSV (handle quotes and commas).
 */
function escapeCSV(value: string | number | undefined | null): string {
  if (value === undefined || value === null) {
    return ''
  }

  const str = String(value)

  // If contains comma, newline, or quote, wrap in quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
    // Double any existing quotes
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Export suggestions to CSV format.
 *
 * @param suggestions Geocoded suggestions to export
 * @returns CSV string
 */
export function exportToCSV(suggestions: readonly GeocodedSuggestion[]): string {
  const rows: string[] = []

  // Header row
  rows.push(CSV_COLUMNS.map(escapeCSV).join(','))

  // Data rows
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i]
    if (!s) continue

    const row = [
      i + 1, // id (1-indexed)
      formatDate(s.timestamp),
      formatTime(s.timestamp),
      s.sender,
      s.originalMessage.replace(/\n/g, ' ').slice(0, 500),
      s.activity,
      formatLocation(s) ?? '',
      s.latitude ?? '',
      s.longitude ?? '',
      s.confidence.toFixed(2),
      s.activityScore.toFixed(2),
      s.category,
      googleMapsLink(s.latitude, s.longitude),
      'pending' // status
    ]

    rows.push(row.map(escapeCSV).join(','))
  }

  return rows.join('\n')
}
