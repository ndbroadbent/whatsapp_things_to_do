/**
 * Images Module
 *
 * Fetches images for activities using a priority chain:
 * 1. Scraped OG images (already available from URL scraping)
 * 2. CDN default images (category/action based)
 * 3. Google Places Photos (for venues with placeId - NOT cities/regions)
 * 4. Pixabay (for generic activities)
 *
 * Returns null if no image found.
 */

import type { ResponseCache } from '../cache/types'
import type { GeocodedActivity } from '../types/geocoder'
import { fetchCdnDefaultImage } from './cdn'
import { fetchGooglePlacesPhoto } from './google-places'
import { fetchPixabayImage } from './pixabay'
import type { ImageFetchConfig, ImageResult } from './types'

export { fetchGooglePlacesPhoto } from './google-places'
export { fetchPixabayImage } from './pixabay'
export type { ImageFetchConfig, ImageResult, ImageSource } from './types'
export { fetchWikipediaImage } from './wikipedia'

/** Extract URLs from message text */
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
  return text.match(urlRegex) ?? []
}

/** Find scraped image URL for an activity by looking up URLs in the message */
function findScrapedImage(
  activity: GeocodedActivity,
  scrapedMetadata: Map<string, { imageUrl: string | null }> | undefined
): string | null {
  if (!scrapedMetadata) return null

  const urls = extractUrls(activity.originalMessage)
  for (const url of urls) {
    const metadata = scrapedMetadata.get(url)
    if (metadata?.imageUrl) {
      return metadata.imageUrl
    }
  }
  return null
}

/**
 * Fetch an image for a single activity.
 *
 * Tries sources in priority order: scraped → cdn → google_places → pixabay.
 * Returns null if no image found from any source.
 */
export async function fetchImageForActivity(
  activity: GeocodedActivity,
  config: ImageFetchConfig,
  cache: ResponseCache
): Promise<ImageResult | null> {
  // 1. Check for scraped OG image (highest priority)
  const scrapedImageUrl = findScrapedImage(activity, config.scrapedMetadata)
  if (scrapedImageUrl) {
    return { url: scrapedImageUrl, source: 'scraped' }
  }

  // 2. Try CDN default images (unless --no-image-cdn)
  if (!config.skipCdn) {
    const result = await fetchCdnDefaultImage(activity)
    if (result) return result
  }

  // 3. Try Google Places Photos (only for venue placeIds, not city/region placeIds)
  if (
    activity.placeId &&
    activity.isVenuePlaceId &&
    !config.skipGooglePlaces &&
    config.googlePlacesApiKey
  ) {
    const result = await fetchGooglePlacesPhoto(activity.placeId, config.googlePlacesApiKey)
    if (result) return result
  }

  // 4. Try Pixabay (if not skipped and has API key)
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
