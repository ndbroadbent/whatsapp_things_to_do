/**
 * Images Module
 *
 * Fetches images for activities using a priority chain:
 * 1. Scraped OG images (already available from URL scraping)
 * 2. CDN default images (category/action based)
 * 3. Google Places Photos (for venues with placeId)
 * 4. Wikipedia (for landmarks, cities, countries)
 * 5. Pixabay (for generic activities)
 *
 * Returns null if no image found.
 */

import type { ResponseCache } from '../cache/types'
import type { GeocodedActivity } from '../types/geocoder'
import { fetchCdnDefaultImage } from './cdn'
import { fetchGooglePlacesPhoto } from './google-places'
import { fetchPixabayImage } from './pixabay'
import type { ImageFetchConfig, ImageResult } from './types'
import { fetchWikipediaImage } from './wikipedia'

export { fetchGooglePlacesPhoto } from './google-places'
export { fetchPixabayImage } from './pixabay'
export type { ImageFetchConfig, ImageResult, ImageSource } from './types'
export { fetchWikipediaImage } from './wikipedia'

/**
 * Fetch an image for a single activity.
 *
 * Tries sources in priority order: scraped → cdn → google_places → wikipedia → pixabay.
 * Returns null if no image found from any source.
 */
export async function fetchImageForActivity(
  activity: GeocodedActivity,
  config: ImageFetchConfig,
  cache: ResponseCache
): Promise<ImageResult | null> {
  // 1. Check for scraped OG image (imageUrl field would be added to activity)
  // This requires adding imageUrl to ClassifiedActivity type
  // if (activity.imageUrl) {
  //   return { url: activity.imageUrl, source: 'scraped' }
  // }

  // 2. Try CDN default images (unless --no-image-cdn)
  if (!config.skipCdn) {
    const result = await fetchCdnDefaultImage(activity)
    if (result) return result
  }

  // 3. Try Google Places Photos (if placeId and not skipped)
  if (activity.placeId && !config.skipGooglePlaces && config.googlePlacesApiKey) {
    const result = await fetchGooglePlacesPhoto(activity.placeId, config.googlePlacesApiKey)
    if (result) return result
  }

  // 4. Try Wikipedia (if venue/city/country and not skipped)
  if (!config.skipWikipedia && (activity.venue || activity.city || activity.country)) {
    const result = await fetchWikipediaImage(activity, cache)
    if (result) return result
  }

  // 5. Try Pixabay (if not skipped and has API key)
  if (!config.skipPixabay && config.pixabayApiKey) {
    const result = await fetchPixabayImage(activity, config.pixabayApiKey, cache)
    if (result) return result
  }

  return null
}

/**
 * Fetch images for multiple activities.
 *
 * Returns a map of messageId → ImageResult (or null if no image found).
 */
export async function fetchImagesForActivities(
  activities: readonly GeocodedActivity[],
  config: ImageFetchConfig,
  cache: ResponseCache,
  options?: {
    onProgress?: (current: number, total: number) => void
  }
): Promise<Map<number, ImageResult | null>> {
  const results = new Map<number, ImageResult | null>()
  const total = activities.length

  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i]
    if (!activity) continue

    const result = await fetchImageForActivity(activity, config, cache)
    results.set(activity.messageId, result)

    options?.onProgress?.(i + 1, total)
  }

  return results
}
