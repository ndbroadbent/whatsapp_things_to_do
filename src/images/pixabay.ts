/**
 * Pixabay Image Fetching
 *
 * Fetches stock photos from Pixabay for generic activities.
 * Requires API key. Images must be downloaded (no permanent hotlinking).
 *
 * API: https://pixabay.com/api/docs/
 */

import { generateImageCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import { httpFetch } from '../http'
import type { GeocodedActivity } from '../types/geocoder'
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

    const result = parsePixabayHit(hit)
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
 * Priority: action+object > action+city > city+country > category
 */
function buildSearchQuery(activity: GeocodedActivity): string | null {
  const parts: string[] = []

  // Try action + object first (e.g., "hiking mountains")
  if (activity.action && activity.object) {
    parts.push(activity.action, activity.object)
  } else if (activity.action && activity.city) {
    // action + city (e.g., "kayaking queenstown")
    parts.push(activity.action, activity.city)
  } else if (activity.city && activity.country) {
    // city + country (e.g., "auckland new zealand")
    parts.push(activity.city, activity.country)
  } else if (activity.action) {
    parts.push(activity.action)
  } else if (activity.category && activity.category !== 'other') {
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
  readonly pageURL: string
}

interface PixabayResponse {
  readonly total: number
  readonly totalHits: number
  readonly hits: readonly PixabayHit[]
}

function parsePixabayHit(hit: PixabayHit): ImageResult {
  return {
    // Use webformatURL (640px) - largeImageURL requires download
    url: hit.webformatURL,
    width: hit.webformatWidth,
    height: hit.webformatHeight,
    source: 'pixabay',
    attribution: {
      name: `Pixabay: ${hit.user}`,
      url: hit.pageURL
    }
  }
}
