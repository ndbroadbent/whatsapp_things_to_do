/**
 * Images Module
 *
 * Fetches images for activities using a priority chain:
 * 1. Google Places Photos (for venues with placeId)
 * 2. Media Library - Object match (curated images by object name/synonym)
 * 3. Pixabay (AI-filtered stock photos)
 * 4. Wikipedia (AI-filtered, license-checked)
 * 5. Media Library - Action fallback (unambiguous action verbs)
 * 6. Category default (from media library)
 *
 * Returns null if no image found.
 *
 * ⚠️ LEGAL NOTICE: OpenGraph/scraped images are NOT used here.
 * OG images can ONLY be used for inline link previews (shown with the URL).
 * Using them as activity images = republishing = copyright infringement.
 * See project_docs/IMAGES.md for full licensing rules.
 */

import type { ResponseCache } from '../caching/types'
import type { GeocodedActivity } from '../types/geocoder'
import { fetchCdnDefaultImage } from './cdn'
import { fetchGooglePlacesPhoto } from './google-places'
import {
  buildImageUrl,
  findActionFallbackImage,
  findCategoryFallbackImage,
  findObjectImage,
  loadMediaIndex,
  type MediaIndex,
  type MediaLibraryMatch
} from './media-index'
import { fetchPixabayImage } from './pixabay'
import type { ImageFetchConfig, ImageResult } from './types'

export { fetchGooglePlacesPhoto } from './google-places'
export {
  buildImageUrl,
  findActionFallbackImage,
  findCategoryFallbackImage,
  findObjectImage,
  IMAGE_SIZES,
  type ImageSize,
  loadMediaIndex,
  type MediaIndexOptions
} from './media-index'
export { fetchPixabayImage } from './pixabay'
export {
  filterPixabayImages,
  type PixabayImageCandidate,
  type PixabayImageMatch
} from './pixabay-filter'
export type { ImageFetchConfig, ImageMetadata, ImageResult, ImageSource } from './types'
export { fetchWikipediaImage } from './wikipedia'
export {
  filterWikipediaImages,
  type WikipediaImageCandidate,
  type WikipediaImageMatch
} from './wikipedia-filter'
export {
  hasAllowedLicense,
  isLicenseAllowed,
  type LicenseCheckResult
} from './wikipedia-license'

/** Cached media index - loaded once per session */
let cachedMediaIndex: MediaIndex | null = null
let mediaIndexPath: string | null = null

/**
 * Fetch an image for a single activity.
 *
 * Tries sources in priority order:
 * 1. Google Places (venue with placeId)
 * 2. Media Library - Object match
 * 3. Pixabay (AI-filtered)
 * 4. Wikipedia (AI-filtered + license checked)
 * 5. Media Library - Action fallback
 * 6. Category default
 *
 * Returns null if no image found from any source.
 *
 * NOTE: Scraped OG images are intentionally NOT used here.
 * OG images can only be displayed as link previews within message context.
 */
export async function fetchImageForActivity(
  activity: GeocodedActivity,
  config: ImageFetchConfig,
  cache: ResponseCache
): Promise<ImageResult | null> {
  // 1. Try Google Places Photos (only for venue placeIds, not city/region placeIds)
  if (
    activity.placeId &&
    activity.isVenuePlaceId &&
    !config.skipGooglePlaces &&
    config.googlePlacesApiKey
  ) {
    const result = await fetchGooglePlacesPhoto(activity.placeId, config.googlePlacesApiKey, cache)
    if (result) return result
  }

  // Load media index (cached per session) - only if not skipped
  const shouldUseMediaLibrary = !config.skipMediaLibrary && !config.skipCdn
  const mediaIndex = shouldUseMediaLibrary ? await getMediaIndex(config) : null

  // 2. Try Media Library - Object match (if we have index)
  if (mediaIndex) {
    const result = tryMediaLibraryObjectMatch(activity, mediaIndex, config)
    if (result) return result
  }

  // 3. Try Pixabay (if not skipped and has API key)
  if (!config.skipPixabay && config.pixabayApiKey) {
    const result = await fetchPixabayImage(activity, config.pixabayApiKey, cache)
    if (result) return result
  }

  // 4. Try CDN default images (legacy fallback, unless --no-image-cdn)
  if (!config.skipCdn && !config.skipMediaLibrary) {
    const result = await fetchCdnDefaultImage(activity)
    if (result) return result
  }

  // 5. Try Media Library - Action fallback
  if (mediaIndex && activity.action) {
    const result = tryMediaLibraryActionFallback(activity, mediaIndex, config)
    if (result) return result
  }

  // 6. Try Media Library - Category fallback
  if (mediaIndex && activity.category && activity.category !== 'other') {
    const result = tryMediaLibraryCategoryFallback(activity, mediaIndex, config)
    if (result) return result
  }

  return null
}

/**
 * Convert a media library match to an ImageResult.
 */
function matchToImageResult(match: MediaLibraryMatch, config: ImageFetchConfig): ImageResult {
  return {
    url: buildImageUrl(match, 700, { localPath: config.mediaLibraryPath }),
    source: 'media_library',
    attribution: {
      name: `ChatToMap: ${match.objectName}`,
      url: 'https://chattomap.com'
    }
  }
}

/**
 * Try to find an image from media library by object name/synonym.
 */
function tryMediaLibraryObjectMatch(
  activity: GeocodedActivity,
  index: MediaIndex,
  config: ImageFetchConfig
): ImageResult | null {
  if (!activity.object) return null
  const match = findObjectImage(activity.object, index, {
    countryCode: config.countryCode,
    localPath: config.mediaLibraryPath
  })
  return match ? matchToImageResult(match, config) : null
}

/**
 * Try to find an image from media library by action verb.
 */
function tryMediaLibraryActionFallback(
  activity: GeocodedActivity,
  index: MediaIndex,
  config: ImageFetchConfig
): ImageResult | null {
  if (!activity.action) return null
  const match = findActionFallbackImage(activity.action, index)
  return match ? matchToImageResult(match, config) : null
}

/**
 * Try to find a category fallback image from media library.
 */
function tryMediaLibraryCategoryFallback(
  activity: GeocodedActivity,
  index: MediaIndex,
  config: ImageFetchConfig
): ImageResult | null {
  if (!activity.category || activity.category === 'other') return null
  const match = findCategoryFallbackImage(activity.category, index)
  return match ? matchToImageResult(match, config) : null
}

/**
 * Get media index, loading it if not cached.
 */
async function getMediaIndex(config: ImageFetchConfig): Promise<MediaIndex | null> {
  const currentPath = config.mediaLibraryPath ?? null

  // Return cached index if path matches
  if (cachedMediaIndex !== null && mediaIndexPath === currentPath) {
    return cachedMediaIndex
  }

  // Load and cache
  cachedMediaIndex = await loadMediaIndex({ localPath: config.mediaLibraryPath })
  mediaIndexPath = currentPath

  return cachedMediaIndex
}

/**
 * Clear cached media index (useful for testing).
 */
export function clearMediaIndexCache(): void {
  cachedMediaIndex = null
  mediaIndexPath = null
}

/**
 * Fetch images for multiple activities.
 *
 * Returns a map of activityId → ImageResult (or null if no image found).
 * Uses activityId (not messageId) because compound activities can create
 * multiple activities from a single message.
 */
export async function fetchImagesForActivities(
  activities: readonly GeocodedActivity[],
  config: ImageFetchConfig,
  cache: ResponseCache,
  options?: {
    onProgress?: (current: number, total: number) => void
  }
): Promise<Map<string, ImageResult | null>> {
  const results = new Map<string, ImageResult | null>()
  const total = activities.length

  for (let i = 0; i < activities.length; i++) {
    const activity = activities[i]
    if (!activity) continue

    const result = await fetchImageForActivity(activity, config, cache)
    results.set(activity.activityId, result)

    options?.onProgress?.(i + 1, total)
  }

  return results
}
