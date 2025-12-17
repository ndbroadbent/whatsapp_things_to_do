/**
 * Export Utilities
 *
 * Shared utility functions for all export formats.
 */

/**
 * Format a date as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? ''
}

/**
 * Format a time as HH:MM:SS.
 */
export function formatTime(date: Date): string {
  return date.toTimeString().split(' ')[0] ?? ''
}

/**
 * Generate a Google Maps link for coordinates.
 */
export function googleMapsLink(lat?: number, lng?: number): string {
  if (lat === undefined || lng === undefined) {
    return ''
  }
  return `https://www.google.com/maps?q=${lat},${lng}`
}
