/**
 * Geocoder Module
 *
 * Convert location text to coordinates using Google Maps APIs.
 */

import { generateGeocodeCacheKey } from '../cache/key.js'
import { DEFAULT_CACHE_TTL_SECONDS } from '../cache/types.js'
import { extractGoogleMapsCoords } from '../extractor/url-classifier.js'
import { httpFetch } from '../http.js'
import type {
  ClassifiedSuggestion,
  GeocodedSuggestion,
  GeocodeResult,
  GeocoderConfig,
  ResponseCache,
  Result
} from '../types.js'

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

  // Build the query, optionally adding region bias
  let query = location
  if (
    config.defaultCountry &&
    !location.toLowerCase().includes(config.defaultCountry.toLowerCase())
  ) {
    query = `${location}, ${config.defaultCountry}`
  }

  const params = new URLSearchParams({
    address: query,
    key: config.apiKey
  })

  if (config.regionBias) {
    params.set('region', config.regionBias.toLowerCase())
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
      await cache.set(
        cacheKey,
        { data: geocodeResult, cachedAt: Date.now() },
        DEFAULT_CACHE_TTL_SECONDS
      )
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
 * Try to extract coordinates from a Google Maps URL.
 */
function tryExtractFromUrl(suggestion: ClassifiedSuggestion): GeocodeResult | null {
  // Check if the original message contains a Google Maps URL
  const urls = suggestion.originalMessage.match(/https?:\/\/[^\s]+/gi)
  if (!urls) return null

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
          formattedAddress: suggestion.location ?? ''
        }
      }
    }
  }

  return null
}

/**
 * Geocode a single suggestion.
 */
async function geocodeSuggestion(
  suggestion: ClassifiedSuggestion,
  config: GeocoderConfig,
  cache?: ResponseCache
): Promise<GeocodedSuggestion> {
  // First, try to extract coords from Google Maps URL
  const urlCoords = tryExtractFromUrl(suggestion)
  if (urlCoords) {
    return {
      ...suggestion,
      latitude: urlCoords.latitude,
      longitude: urlCoords.longitude,
      formattedAddress: urlCoords.formattedAddress || suggestion.location,
      geocodeSource: 'google_maps_url'
    }
  }

  // If no location text, return as-is
  if (!suggestion.location) {
    return suggestion
  }

  // Try geocoding the location text
  const result = await geocodeText(suggestion.location, config, cache)

  if (result.ok) {
    return {
      ...suggestion,
      latitude: result.value.latitude,
      longitude: result.value.longitude,
      formattedAddress: result.value.formattedAddress,
      placeId: result.value.placeId,
      geocodeSource: 'google_geocoding'
    }
  }

  // If location geocoding fails, try the activity text
  const activityResult = await geocodeText(suggestion.activity, config, cache)

  if (activityResult.ok) {
    return {
      ...suggestion,
      latitude: activityResult.value.latitude,
      longitude: activityResult.value.longitude,
      formattedAddress: activityResult.value.formattedAddress,
      placeId: activityResult.value.placeId,
      geocodeSource: 'place_search'
    }
  }

  // Could not geocode - return without coordinates
  return suggestion
}

/**
 * Geocode all suggestions that have location information.
 *
 * @param suggestions Classified suggestions to geocode
 * @param config Geocoder configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @returns Geocoded suggestions (some may not have coordinates if geocoding failed)
 */
export async function geocodeSuggestions(
  suggestions: readonly ClassifiedSuggestion[],
  config: GeocoderConfig,
  cache?: ResponseCache
): Promise<GeocodedSuggestion[]> {
  const results: GeocodedSuggestion[] = []

  for (const suggestion of suggestions) {
    const geocoded = await geocodeSuggestion(suggestion, config, cache)
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
 * Count geocoded suggestions.
 */
export function countGeocoded(suggestions: readonly GeocodedSuggestion[]): number {
  return suggestions.filter((s) => s.latitude !== undefined && s.longitude !== undefined).length
}

/**
 * Filter to only geocoded suggestions (those with coordinates).
 */
export function filterGeocoded(suggestions: readonly GeocodedSuggestion[]): GeocodedSuggestion[] {
  return suggestions.filter(
    (s): s is GeocodedSuggestion & { latitude: number; longitude: number } =>
      s.latitude !== undefined && s.longitude !== undefined
  )
}

/**
 * Calculate the center point of geocoded suggestions.
 */
export function calculateCenter(
  suggestions: readonly GeocodedSuggestion[]
): { lat: number; lng: number } | null {
  const geocoded = filterGeocoded(suggestions)

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
