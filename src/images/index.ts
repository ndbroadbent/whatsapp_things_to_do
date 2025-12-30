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
import { httpFetch } from '../http'
import type { GeocodedActivity } from '../types/place-lookup'
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
import type { ImageFetchConfig, ImageMeta, ImageResult, ImageSource } from './types'

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
export type { ImageFetchConfig, ImageMeta, ImageMetadata, ImageResult, ImageSource } from './types'
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

  // Load media index (cached per session)
  const mediaIndex = config.skipMediaLibrary ? null : await getMediaIndex(config)

  // 2. Try Media Library - Object match (if we have index)
  if (mediaIndex) {
    const result = await tryMediaLibraryObjectMatch(activity, mediaIndex, config)
    if (result) return result
  }

  // 3. Try Pixabay (if not skipped and has API key)
  if (!config.skipPixabay && config.pixabayApiKey) {
    const result = await fetchPixabayImage(activity, config.pixabayApiKey, cache)
    if (result) return result
  }

  // 4. Try Media Library - Action fallback
  if (mediaIndex && activity.action) {
    const result = await tryMediaLibraryActionFallback(activity, mediaIndex, config)
    if (result) return result
  }

  // 5. Try Media Library - Category fallback
  if (mediaIndex && activity.category && activity.category !== 'other') {
    const result = await tryMediaLibraryCategoryFallback(activity, mediaIndex, config)
    if (result) return result
  }

  return null
}

/**
 * Convert a media library match to an ImageResult.
 * Loads the -meta.json to get the original source and attribution.
 * Works for both local filesystem and CDN.
 */
async function matchToImageResult(
  match: MediaLibraryMatch,
  config: ImageFetchConfig
): Promise<ImageResult | null> {
  const imageUrl = buildImageUrl(match, 700, { localPath: config.mediaLibraryPath })
  const meta = await loadImageMeta(match, config)

  if (!meta) {
    return null // No metadata = can't use this image
  }

  return { imageUrl, meta, fromMediaLibrary: true }
}

/**
 * Load image metadata from -meta.json file.
 * Works for both local filesystem and CDN.
 */
async function loadImageMeta(
  match: MediaLibraryMatch,
  config: ImageFetchConfig
): Promise<ImageMeta | null> {
  const { type, item, hash } = match.resolved
  const metaFilename = `${hash}-meta.json`

  try {
    let raw: unknown

    if (config.mediaLibraryPath) {
      // Local filesystem
      const { readFileSync, existsSync } = await import('node:fs')
      const { join } = await import('node:path')
      const fullPath = join(config.mediaLibraryPath, type, item, metaFilename)

      if (!existsSync(fullPath)) {
        return null
      }
      raw = JSON.parse(readFileSync(fullPath, 'utf-8'))
    } else {
      // CDN - fetch metadata JSON
      const metaUrl = `${buildImageUrl(match, 700).replace(/-700\.jpg$/, '-meta.json')}`
      const response = await httpFetch(metaUrl)
      if (!response.ok) {
        return null
      }
      raw = await response.json()
    }

    return parseImageMeta(raw)
  } catch {
    return null
  }
}

/**
 * Parse raw JSON into ImageMeta, validating the source field.
 */
function parseImageMeta(raw: unknown): ImageMeta | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>
  const source = parseImageSource(obj.source)
  if (!source) return null

  const meta: ImageMeta = {
    source,
    url: typeof obj.url === 'string' ? obj.url : ''
  }

  if (typeof obj.license === 'string') {
    ;(meta as { license: string }).license = obj.license
  }
  if (typeof obj.license_url === 'string') {
    ;(meta as { license_url: string }).license_url = obj.license_url
  }

  const attr = obj.attribution
  if (attr && typeof attr === 'object') {
    const a = attr as Record<string, unknown>
    if (typeof a.name === 'string' && typeof a.url === 'string') {
      ;(meta as { attribution: { name: string; url: string } }).attribution = {
        name: a.name,
        url: a.url
      }
    }
  }

  return meta
}

/**
 * Parse source string to ImageSource type.
 */
function parseImageSource(source: unknown): ImageSource | null {
  if (typeof source !== 'string') return null

  switch (source) {
    case 'pixabay':
      return 'pixabay'
    case 'unsplash':
      return 'unsplash'
    case 'unsplash+':
      return 'unsplash+'
    case 'wikipedia':
    case 'wikimedia':
      return 'wikipedia'
    default:
      return null
  }
}

/**
 * Check if we should display attribution for the given source and license.
 *
 * REQUIRED (legal/TOS requirement):
 * - Google Places (per Google TOS)
 * - Wikipedia with CC-BY or CC-BY-SA licenses
 *
 * APPRECIATED (we show it, but not legally required):
 * - Unsplash (standard license)
 * - Pixabay
 *
 * NOT SHOWN:
 * - Unsplash+ (extended license, no attribution needed)
 * - Wikipedia CC0 or Public Domain
 * - User uploads
 */
export function shouldShowAttribution(source: ImageSource, license?: string): boolean {
  // Unsplash+ doesn't need attribution
  if (source === 'unsplash+') return false

  // Google Places - required per TOS
  if (source === 'google_places') return true

  // Unsplash and Pixabay - appreciated (we show it)
  if (source === 'unsplash' || source === 'pixabay') return true

  // Wikipedia - depends on license
  if (source === 'wikipedia') {
    if (!license) return true // Assume required if unknown
    const lcLicense = license.toLowerCase()
    // CC0 and Public Domain don't require attribution
    if (lcLicense.includes('cc0') || lcLicense.includes('public domain')) return false
    // CC-BY and CC-BY-SA require attribution
    return true
  }

  // User uploads - don't show attribution
  return false
}

/**
 * Try to find an image from media library by object name/synonym.
 */
async function tryMediaLibraryObjectMatch(
  activity: GeocodedActivity,
  index: MediaIndex,
  config: ImageFetchConfig
): Promise<ImageResult | null> {
  if (!activity.object) return null
  const match = findObjectImage(activity.object, index, {
    countryCode: config.countryCode,
    localPath: config.mediaLibraryPath
  })
  return match ? await matchToImageResult(match, config) : null
}

/**
 * Try to find an image from media library by action verb.
 */
async function tryMediaLibraryActionFallback(
  activity: GeocodedActivity,
  index: MediaIndex,
  config: ImageFetchConfig
): Promise<ImageResult | null> {
  if (!activity.action) return null
  const match = findActionFallbackImage(activity.action, index)
  return match ? await matchToImageResult(match, config) : null
}

/**
 * Try to find a category fallback image from media library.
 */
async function tryMediaLibraryCategoryFallback(
  activity: GeocodedActivity,
  index: MediaIndex,
  config: ImageFetchConfig
): Promise<ImageResult | null> {
  if (!activity.category || activity.category === 'other') return null
  const match = findCategoryFallbackImage(activity.category, index)
  return match ? await matchToImageResult(match, config) : null
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
