/**
 * Geocoder Module
 *
 * Convert location text to coordinates using Google Maps APIs.
 */

import countries from 'i18n-iso-countries'
import { generateGeocodeCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import { extractGoogleMapsCoords } from '../extraction/heuristics/url-classifier'
import { httpFetch } from '../http'
import {
  type ClassifiedActivity,
  formatLocation,
  type GeocodedActivity,
  type GeocodeResult,
  type GeocoderConfig,
  type Result
} from '../types'

/**
 * Convert country name to 2-letter region code (ISO 3166-1 alpha-2).
 */
function countryToRegionCode(country: string): string | null {
  // Try to get alpha-2 code from country name
  const code = countries.getAlpha2Code(country, 'en')
  return code?.toLowerCase() ?? null
}

interface GoogleGeocodingResponse {
  status: string
  results: Array<{
    geometry: {
      location: {
        lat: number
        lng: number
      }
    }
    formatted_address: string
    place_id: string
  }>
  error_message?: string
}

/**
 * Geocode a location string using Google Geocoding API.
 */
async function geocodeText(
  location: string,
  config: GeocoderConfig,
  cache?: ResponseCache
): Promise<Result<GeocodeResult>> {
  // Check cache first
  const cacheKey = generateGeocodeCacheKey(location, config.regionBias)
  if (cache) {
    const cached = await cache.get<GeocodeResult>(cacheKey)
    if (cached) {
      return { ok: true, value: cached.data }
    }
  }

  // Build the query with region bias (soft preference, not forced)
  const params = new URLSearchParams({
    address: location,
    key: config.apiKey
  })

  // Use region bias for soft preference toward a country
  // This helps disambiguate but doesn't force results to that country
  if (config.regionBias) {
    params.set('region', config.regionBias.toLowerCase())
  } else if (config.defaultCountry) {
    // Convert country name to 2-letter code for region bias
    const regionCode = countryToRegionCode(config.defaultCountry)
    if (regionCode) {
      params.set('region', regionCode)
    }
  }

  try {
    const response = await httpFetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`
    )

    if (!response.ok) {
      return {
        ok: false,
        error: {
          type: 'network',
          message: `API error ${response.status}: ${await response.text()}`
        }
      }
    }

    const data = (await response.json()) as GoogleGeocodingResponse

    if (data.status === 'OVER_QUERY_LIMIT') {
      return {
        ok: false,
        error: {
          type: 'quota',
          message: 'Google Geocoding API quota exceeded'
        }
      }
    }

    if (data.status === 'REQUEST_DENIED') {
      return {
        ok: false,
        error: {
          type: 'auth',
          message: data.error_message ?? 'Request denied'
        }
      }
    }

    if (data.status !== 'OK' || data.results.length === 0) {
      return {
        ok: false,
        error: {
          type: 'invalid_response',
          message: `No results found for: ${location}`
        }
      }
    }

    const result = data.results[0]
    if (!result) {
      return {
        ok: false,
        error: {
          type: 'invalid_response',
          message: `No results found for: ${location}`
        }
      }
    }

    const geocodeResult: GeocodeResult = {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id
    }

    // Cache the successful result
    if (cache) {
      await cache.set(cacheKey, { data: geocodeResult, cachedAt: Date.now() })
    }

    return { ok: true, value: geocodeResult }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: { type: 'network', message: `Network error: ${message}` }
    }
  }
}

/**
 * Try to extract coordinates from a Google Maps URL in any message.
 */
function tryExtractFromUrl(activity: ClassifiedActivity): GeocodeResult | null {
  // Check all messages for Google Maps URLs
  for (const msg of activity.messages) {
    const urls = msg.message.match(/https?:\/\/[^\s]+/gi)
    if (!urls) continue

    for (const url of urls) {
      if (
        url.includes('maps.google') ||
        url.includes('goo.gl/maps') ||
        url.includes('maps.app.goo.gl') ||
        url.includes('google.com/maps')
      ) {
        const coords = extractGoogleMapsCoords(url)
        if (coords) {
          return {
            latitude: coords.lat,
            longitude: coords.lng,
            formattedAddress: formatLocation(activity) ?? ''
          }
        }
      }
    }
  }

  return null
}

/**
 * Geocode a single activity.
 *
 * Exported for CLI worker pool parallelism.
 */
export async function geocodeActivity(
  activity: ClassifiedActivity,
  config: GeocoderConfig,
  cache?: ResponseCache
): Promise<GeocodedActivity> {
  const location = formatLocation(activity)

  // First, try to extract coords from Google Maps URL
  const urlCoords = tryExtractFromUrl(activity)
  if (urlCoords) {
    return {
      ...activity,
      latitude: urlCoords.latitude,
      longitude: urlCoords.longitude,
      formattedAddress: urlCoords.formattedAddress || location || undefined,
      geocodeSource: 'google_maps_url'
    }
  }

  // If no location text, return as-is (nothing to geocode)
  if (!location) {
    return activity
  }

  // Try geocoding the location text
  const result = await geocodeText(location, config, cache)

  if (result.ok) {
    // isVenuePlaceId is true only if we have a specific venue name
    // (not just city/country which would give us a city placeId)
    const isVenuePlaceId = Boolean(activity.venue)

    return {
      ...activity,
      latitude: result.value.latitude,
      longitude: result.value.longitude,
      formattedAddress: result.value.formattedAddress,
      placeId: result.value.placeId,
      geocodeSource: 'google_geocoding',
      isVenuePlaceId
    }
  }

  // If location geocoding fails, try the activity text
  const activityResult = await geocodeText(activity.activity, config, cache)

  if (activityResult.ok) {
    // place_search on activity text is likely a venue search
    return {
      ...activity,
      latitude: activityResult.value.latitude,
      longitude: activityResult.value.longitude,
      formattedAddress: activityResult.value.formattedAddress,
      placeId: activityResult.value.placeId,
      geocodeSource: 'place_search',
      isVenuePlaceId: true
    }
  }

  // Could not geocode - return without coordinates
  return activity
}

/**
 * Geocode all activities that have location information.
 *
 * @param activities Classified activities to geocode
 * @param config Geocoder configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @returns Geocoded activities (some may not have coordinates if geocoding failed)
 */
export async function geocodeActivities(
  activities: readonly ClassifiedActivity[],
  config: GeocoderConfig,
  cache?: ResponseCache
): Promise<GeocodedActivity[]> {
  const results: GeocodedActivity[] = []

  for (const activity of activities) {
    const geocoded = await geocodeActivity(activity, config, cache)
    results.push(geocoded)
  }

  return results
}

/**
 * Geocode a single location string.
 *
 * @param location Location text to geocode
 * @param config Geocoder configuration
 * @returns Geocode result or error
 */
export async function geocodeLocation(
  location: string,
  config: GeocoderConfig
): Promise<Result<GeocodeResult>> {
  return geocodeText(location, config)
}

/**
 * Count geocoded activities.
 */
export function countGeocoded(activities: readonly GeocodedActivity[]): number {
  return activities.filter((a) => a.latitude !== undefined && a.longitude !== undefined).length
}

/**
 * Filter to only geocoded activities (those with coordinates).
 */
export function filterGeocoded(activities: readonly GeocodedActivity[]): GeocodedActivity[] {
  return activities.filter(
    (a): a is GeocodedActivity & { latitude: number; longitude: number } =>
      a.latitude !== undefined && a.longitude !== undefined
  )
}

/**
 * Calculate the center point of geocoded activities.
 */
export function calculateCenter(
  activities: readonly GeocodedActivity[]
): { lat: number; lng: number } | null {
  const geocoded = filterGeocoded(activities)

  if (geocoded.length === 0) {
    return null
  }

  const sumLat = geocoded.reduce((sum, s) => sum + (s.latitude as number), 0)
  const sumLng = geocoded.reduce((sum, s) => sum + (s.longitude as number), 0)

  return {
    lat: sumLat / geocoded.length,
    lng: sumLng / geocoded.length
  }
}
