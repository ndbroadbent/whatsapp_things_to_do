/**
 * Stock Image Query Builder
 *
 * Shared query building logic for stock image providers (Pexels, Pixabay).
 * Uses the AI-generated image.stock query string.
 */

import type { GeocodedActivity } from '../types/place-lookup'

/**
 * Get stock image query for an activity.
 *
 * Uses the AI-generated image.stock field which already includes activity,
 * location context, and relevant keywords.
 *
 * Falls back to category if image.stock is empty.
 *
 * @param activity - The geocoded activity to get a query for
 * @param maxLength - Maximum query length (default 100, suitable for Pexels/Pixabay)
 * @returns Query string or null if no meaningful query can be built
 */
export function buildStockImageQuery(activity: GeocodedActivity, maxLength = 100): string | null {
  // Use AI-generated stock query - this already has location context
  if (activity.image.stock) {
    return activity.image.stock.slice(0, maxLength)
  }

  // Fallback to category if stock query is empty
  if (activity.category && activity.category !== 'other') {
    return activity.category.slice(0, maxLength)
  }

  return null
}
