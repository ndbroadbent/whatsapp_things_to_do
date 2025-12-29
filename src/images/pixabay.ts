/**
 * Pixabay Image Fetching
 *
 * Fetches stock photos from Pixabay for generic activities.
 * Requires API key. Images must be downloaded (no permanent hotlinking).
 *
 * API: https://pixabay.com/api/docs/
 */

import { generateImageCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { httpFetch } from '../http'
import type { GeocodedActivity } from '../types/place-lookup'
import { cacheNull, cacheResult, getCached } from './cache-helper'
import type { ImageResult } from './types'

const PIXABAY_API = 'https://pixabay.com/api/'

/**
 * Fetch Pixabay image for an activity.
 *
 * Builds search query from activity fields and returns best match.
 */
export async function fetchPixabayImage(
  activity: GeocodedActivity,
  apiKey: string,
  cache: ResponseCache
): Promise<ImageResult | null> {
  const query = buildSearchQuery(activity)
  if (!query) return null

  const cacheKey = generateImageCacheKey('pixabay', query)

  const cached = await getCached<ImageResult>(cache, cacheKey)
  if (cached.hit) {
    return cached.data
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      q: query,
      image_type: 'photo',
      order: 'popular',
      per_page: '3',
      safesearch: 'true'
    })

    const response = await httpFetch(`${PIXABAY_API}?${params}`)

    if (!response.ok) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const data = (await response.json()) as PixabayResponse

    if (!data.hits || data.hits.length === 0) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const hit = data.hits[0]
    if (!hit) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const result = parsePixabayHit(hit, query)
    await cacheResult(cache, cacheKey, result)

    return result
  } catch {
    await cacheNull(cache, cacheKey)
    return null
  }
}

/**
 * Build search query from activity fields.
 *
 * Always includes: action/object + location (venue/city/region/country) + imageKeywords
 *
 * E.g., "go trip" + "Bay of Islands" + ["coast", "beach", "ocean"]
 *     → "go trip Bay of Islands coast beach ocean"
 */
function buildSearchQuery(activity: GeocodedActivity): string | null {
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

  // Pixabay query max 100 chars
  return parts.join(' ').slice(0, 100)
}

interface PixabayHit {
  readonly id: number
  readonly webformatURL: string
  readonly webformatWidth: number
  readonly webformatHeight: number
  readonly largeImageURL: string
  readonly user: string
  readonly user_id: number
  readonly pageURL: string
}

interface PixabayResponse {
  readonly total: number
  readonly totalHits: number
  readonly hits: readonly PixabayHit[]
}

function parsePixabayHit(hit: PixabayHit, query: string): ImageResult {
  return {
    // Use webformatURL (640px) - largeImageURL requires download
    imageUrl: hit.webformatURL,
    width: hit.webformatWidth,
    height: hit.webformatHeight,
    meta: {
      source: 'pixabay',
      url: hit.pageURL,
      license: 'Pixabay License',
      license_url: 'https://pixabay.com/service/license-summary/',
      attribution: {
        name: hit.user,
        url: `https://pixabay.com/users/${hit.user}-${hit.user_id}/`
      }
    },
    query
  }
}
