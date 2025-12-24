/**
 * Wikipedia Image Fetching
 *
 * Fetches images from Wikipedia/Wikimedia for landmarks, cities, and countries.
 * Uses the Wikipedia REST API - free, no API key needed.
 *
 * API: https://en.wikipedia.org/api/rest_v1/page/summary/{title}
 */

import { generateImageCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import { httpFetch } from '../http'
import type { GeocodedActivity } from '../types/geocoder'
import { cacheNull, cacheResult, getCached } from './cache-helper'
import type { ImageResult } from './types'

const WIKIPEDIA_API = 'https://en.wikipedia.org/api/rest_v1/page/summary'

/**
 * Fetch Wikipedia image for an activity.
 *
 * Tries venue, then city, then country.
 */
export async function fetchWikipediaImage(
  activity: GeocodedActivity,
  cache: ResponseCache
): Promise<ImageResult | null> {
  // Try venue first (most specific)
  if (activity.venue) {
    const result = await fetchWikipediaPageImage(activity.venue, cache)
    if (result) return result
  }

  // Try city
  if (activity.city) {
    const result = await fetchWikipediaPageImage(activity.city, cache)
    if (result) return result
  }

  // Try country
  if (activity.country) {
    const result = await fetchWikipediaPageImage(activity.country, cache)
    if (result) return result
  }

  return null
}

/**
 * Fetch the main image for a Wikipedia article.
 */
async function fetchWikipediaPageImage(
  title: string,
  cache: ResponseCache
): Promise<ImageResult | null> {
  const cacheKey = generateImageCacheKey('wikipedia', title)

  const cached = await getCached<ImageResult>(cache, cacheKey)
  if (cached.hit) {
    return cached.data
  }

  try {
    const url = `${WIKIPEDIA_API}/${encodeURIComponent(title)}`
    const response = await httpFetch(url, {
      headers: {
        'User-Agent': 'ChatToMap/1.0 (https://chattomap.com)'
      }
    })

    if (!response.ok) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const data = (await response.json()) as WikipediaResponse
    const result = parseWikipediaResponse(data)

    if (result) {
      await cacheResult(cache, cacheKey, result)
    } else {
      await cacheNull(cache, cacheKey)
    }

    return result
  } catch {
    await cacheNull(cache, cacheKey)
    return null
  }
}

interface WikipediaResponse {
  readonly title?: string
  readonly originalimage?: {
    readonly source: string
    readonly width: number
    readonly height: number
  }
  readonly thumbnail?: {
    readonly source: string
    readonly width: number
    readonly height: number
  }
}

function parseWikipediaResponse(data: WikipediaResponse): ImageResult | null {
  // Prefer original image, fall back to thumbnail
  const image = data.originalimage ?? data.thumbnail

  if (!image?.source) {
    return null
  }

  return {
    url: image.source,
    width: image.width,
    height: image.height,
    source: 'wikipedia',
    attribution: {
      name: `Wikipedia: ${data.title ?? 'Unknown'}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title ?? '')}`
    }
  }
}
