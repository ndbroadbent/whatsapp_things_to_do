/**
 * Stock Image Query Builder
 *
 * Shared query building logic for stock image providers (Pexels, Pixabay).
 * Builds search queries from activity fields for image search APIs.
 */

import type { GeocodedActivity } from '../types/place-lookup'

/**
 * Build search query from activity fields for stock image APIs.
 *
 * Always includes: action/object + location (venue/city/region/country) + imageKeywords
 *
 * E.g., "go trip" + "Bay of Islands" + ["coast", "beach", "ocean"]
 *     → "go trip Bay of Islands coast beach ocean"
 *
 * @param activity - The geocoded activity to build a query for
 * @param maxLength - Maximum query length (default 100, suitable for Pexels/Pixabay)
 * @returns Query string or null if no meaningful query can be built
 */
export function buildStockImageQuery(activity: GeocodedActivity, maxLength = 100): string | null {
  const parts: string[] = []

  // Add action and/or object
  if (activity.action) parts.push(activity.action)
  if (activity.object) parts.push(activity.object)

  // Always add location - venue, city, region, or country (first available)
  const location = activity.venue ?? activity.city ?? activity.region ?? activity.country
  if (location) parts.push(location)

  // Add AI-generated keywords for disambiguation
  if (activity.imageKeywords && activity.imageKeywords.length > 0) {
    parts.push(...activity.imageKeywords)
  }

  // Fallback to category if nothing else
  if (parts.length === 0 && activity.category && activity.category !== 'other') {
    parts.push(activity.category)
  }

  if (parts.length === 0) return null

  // Truncate to max length
  return parts.join(' ').slice(0, maxLength)
}
