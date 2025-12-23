/**
 * Images Module
 *
 * Fetches images for activities using a fallback chain:
 * 1. Scraped OG images (already available from URL scraping)
 * 2. Google Places Photos (for venues with placeId)
 * 3. Wikipedia (for landmarks, cities, countries)
 * 4. Pixabay (for generic activities)
 * 5. Category fallback (emoji/icon)
 */

import type { ResponseCache } from '../cache/types'
import type { GeocodedActivity } from '../types/geocoder'
import type { ImageFetchConfig, ImageResult } from './types'

export type { ImageFetchConfig, ImageResult, ImageSource } from './types'

/**
 * Fetch an image for a single activity.
 *
 * Uses fallback chain: scraped → google_places → wikipedia → pixabay → fallback
 */
export async function fetchImageForActivity(
  activity: GeocodedActivity,
  _config: ImageFetchConfig,
  _cache: ResponseCache
): Promise<ImageResult> {
  // TODO: Implement fallback chain

  // 1. Check for scraped OG image
  // if (activity.imageUrl) {
  //   return { url: activity.imageUrl, source: 'scraped' }
  // }

  // 2. Try Google Places Photos (if placeId and not skipped)
  // if (activity.placeId && !config.skipGooglePlaces) {
  //   const result = await fetchGooglePlacesPhoto(activity.placeId, config, cache)
  //   if (result) return result
  // }

  // 3. Try Wikipedia (if venue/city/country)
  // if (!config.skipWikipedia) {
  //   const result = await fetchWikipediaImage(activity, cache)
  //   if (result) return result
  // }

  // 4. Try Pixabay (search by action, object, location)
  // if (!config.skipPixabay) {
  //   const result = await fetchPixabayImage(activity, config, cache)
  //   if (result) return result
  // }

  // 5. Fallback to category
  return getCategoryFallback(activity.category)
}

/**
 * Fetch images for multiple activities.
 *
 * Returns a map of messageId → ImageResult.
 */
export async function fetchImagesForActivities(
  activities: readonly GeocodedActivity[],
  config: ImageFetchConfig,
  cache: ResponseCache
): Promise<Map<number, ImageResult>> {
  const results = new Map<number, ImageResult>()

  for (const activity of activities) {
    const result = await fetchImageForActivity(activity, config, cache)
    results.set(activity.messageId, result)
  }

  return results
}

/**
 * Get category fallback image (emoji representation).
 */
function getCategoryFallback(category: string): ImageResult {
  // Map categories to emoji - these will be rendered as placeholder images
  const categoryEmoji: Record<string, string> = {
    restaurant: '🍽️',
    cafe: '☕',
    bar: '🍺',
    hike: '🥾',
    beach: '🏖️',
    trip: '✈️',
    concert: '🎵',
    movie: '🎬',
    museum: '🏛️',
    sports: '⚽',
    shopping: '🛍️',
    entertainment: '🎬',
    adventure: '🎢',
    art: '🎨',
    nature: '🌲',
    other: '📍'
  }

  const emoji = categoryEmoji[category] ?? '📍'

  return {
    url: `emoji:${emoji}`,
    source: 'fallback'
  }
}
