/**
 * Google Places Photos
 *
 * Fetches photo URLs from Google Places API for venues with placeId.
 * Requires API key.
 *
 * Note: We cache the photo URL result (not the image data itself).
 * Google ToS prohibits caching the actual image content.
 *
 * API: https://developers.google.com/maps/documentation/places/web-service/photos
 */

import { generateImageCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import { httpFetch } from '../http'
import { cacheNull, cacheResult, getCached } from './cache-helper'
import type { ImageResult } from './types'

const PLACES_API = 'https://maps.googleapis.com/maps/api/place/details/json'
const PHOTO_API = 'https://maps.googleapis.com/maps/api/place/photo'

/**
 * Fetch Google Places photo URL for a venue.
 *
 * Caches the URL result (not the image data) to avoid repeated API calls.
 */
export async function fetchGooglePlacesPhoto(
  placeId: string,
  apiKey: string,
  cache: ResponseCache
): Promise<ImageResult | null> {
  const cacheKey = generateImageCacheKey('google_places', placeId)

  const cached = await getCached<ImageResult>(cache, cacheKey)
  if (cached.hit) {
    return cached.data
  }

  try {
    // First, get place details to find photo reference
    const detailsParams = new URLSearchParams({
      place_id: placeId,
      fields: 'photos,name',
      key: apiKey
    })

    const detailsResponse = await httpFetch(`${PLACES_API}?${detailsParams}`)
    if (!detailsResponse.ok) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const details = (await detailsResponse.json()) as PlaceDetailsResponse
    if (details.status !== 'OK' || !details.result?.photos?.length) {
      await cacheNull(cache, cacheKey)
      return null
    }

    const photo = details.result.photos[0]
    if (!photo?.photo_reference) {
      await cacheNull(cache, cacheKey)
      return null
    }

    // Build photo URL (this URL can be used directly - it redirects to the image)
    const photoParams = new URLSearchParams({
      maxwidth: '800',
      photo_reference: photo.photo_reference,
      key: apiKey
    })

    const photoUrl = `${PHOTO_API}?${photoParams}`

    const result: ImageResult = {
      url: photoUrl,
      width: photo.width,
      height: photo.height,
      source: 'google_places',
      attribution: {
        name: photo.html_attributions?.[0]
          ? stripHtml(photo.html_attributions[0])
          : `Google Places: ${details.result.name ?? 'Unknown'}`,
        url: `https://www.google.com/maps/place/?q=place_id:${placeId}`
      }
    }

    await cacheResult(cache, cacheKey, result)
    return result
  } catch {
    await cacheNull(cache, cacheKey)
    return null
  }
}

interface PlacePhoto {
  readonly photo_reference: string
  readonly height: number
  readonly width: number
  readonly html_attributions?: readonly string[]
}

interface PlaceDetailsResponse {
  readonly status: string
  readonly result?: {
    readonly name?: string
    readonly photos?: readonly PlacePhoto[]
  }
}

/**
 * Strip HTML tags from attribution string.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}
