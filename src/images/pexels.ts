/**
 * Pexels Image Fetching
 *
 * Fetches stock photos from Pexels for activities.
 * Primary stock image source - higher quality than Pixabay.
 * Requires API key. Images must be downloaded (no permanent hotlinking).
 *
 * API: https://www.pexels.com/api/documentation/
 *
 * Usage requirements:
 * - Show attribution: "Photos provided by Pexels" (site-wide)
 * - Download images to our server
 * - Link back to photographer when possible
 */

import { generateImageCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { httpFetch } from '../http'
import type { GeocodedActivity } from '../types/place-lookup'
import { cacheNull, cacheResult, getCached } from './cache-helper'
import { buildStockImageQuery } from './query-builder'
import type { ImageResult } from './types'

const PEXELS_API = 'https://api.pexels.com/v1/search'

/**
 * Pexels API response types
 */
interface PexelsPhoto {
  readonly id: number
  readonly width: number
  readonly height: number
  readonly url: string
  readonly photographer: string
  readonly photographer_url: string
  readonly photographer_id: number
  readonly avg_color: string
  readonly src: {
    readonly original: string
    readonly large2x: string
    readonly large: string
    readonly medium: string
    readonly small: string
    readonly portrait: string
    readonly landscape: string
    readonly tiny: string
  }
  readonly alt: string
}

interface PexelsResponse {
  readonly total_results: number
  readonly page: number
  readonly per_page: number
  readonly photos: readonly PexelsPhoto[]
  readonly next_page?: string
}

/**
 * Fetch Pexels image for an activity.
 *
 * Builds search query from activity fields and returns best match.
 * Uses landscape orientation for best results in cards/banners.
 */
export async function fetchPexelsImage(
  activity: GeocodedActivity,
  apiKey: string,
  cache: ResponseCache
): Promise<ImageResult | null> {
  const query = buildStockImageQuery(activity)
  if (!query) return null

  const cacheKey = generateImageCacheKey('pexels', query)

  const cached = await getCached<ImageResult>(cache, cacheKey)
  if (cached.hit) {
    return cached.data
  }

  try {
    const params = new URLSearchParams({
      query,
      orientation: 'landscape',
      per_page: '3'
    })

    const response = await httpFetch(`${PEXELS_API}?${params}`, {
      headers: {
        Authorization: apiKey
      }
    })

    if (!response.ok) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const data = (await response.json()) as PexelsResponse

    if (!data.photos || data.photos.length === 0) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const photo = data.photos[0]
    if (!photo) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const result = parsePexelsPhoto(photo, query)
    await cacheResult(cache, cacheKey, result)

    return result
  } catch {
    await cacheNull(cache, cacheKey)
    return null
  }
}

/**
 * Parse a Pexels photo into an ImageResult.
 *
 * Uses the 'large' size (940px width) which is good for cards/banners.
 * The 'medium' (350px) would be too small, 'large2x' (1880px) is overkill.
 */
function parsePexelsPhoto(photo: PexelsPhoto, query: string): ImageResult {
  return {
    // Use 'large' size - 940px width, good for cards
    imageUrl: photo.src.large,
    width: 940, // Pexels 'large' is always 940px wide
    height: Math.round((940 / photo.width) * photo.height),
    meta: {
      source: 'pexels',
      url: photo.url,
      license: 'Pexels License',
      license_url: 'https://www.pexels.com/license/',
      attribution: {
        name: photo.photographer,
        url: photo.photographer_url
      }
    },
    query
  }
}
