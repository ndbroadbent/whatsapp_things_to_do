/**
 * Place Lookup Module
 *
 * Look up places and get coordinates using Google Places API.
 * Uses Text Search for venue names, falls back to Geocoding API for addresses.
 */

import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json'
import { generatePlaceLookupCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'

import { extractGoogleMapsCoords } from '../extraction/heuristics/url-classifier'
import { guardedFetch, type HttpResponse } from '../http'

import {
  addPlaceLookupUsage,
  type ClassifiedActivity,
  EMPTY_PLACE_LOOKUP_USAGE,
  formatLocation,
  type GeocodedActivity,
  type PlaceLookupConfig,
  type PlaceLookupResult,
  type PlaceLookupUsage,
  type Result
} from '../types'

/** Result from looking up a single activity including usage */
export interface LookupActivityResult {
  readonly activity: GeocodedActivity
  readonly usage: PlaceLookupUsage
}

/** Result from looking up multiple activities including total usage */
export interface LookupActivitiesResult {
  readonly activities: GeocodedActivity[]
  readonly usage: PlaceLookupUsage
}

/** Internal result that includes cache hit info */
interface PlaceLookupInternalResult {
  result: Result<PlaceLookupResult>
  cacheHit: boolean
}

// Register English locale for country name lookups
countries.registerLocale(en)

const PLACES_TEXT_SEARCH_API = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
const GEOCODING_API = 'https://maps.googleapis.com/maps/api/geocode/json'

/**
 * Convert country name to 2-letter region code (ISO 3166-1 alpha-2).
 */
function countryToRegionCode(country: string): string | null {
  const code = countries.getAlpha2Code(country, 'en')
  return code?.toLowerCase() ?? null
}

interface GooglePlacesTextSearchResponse {
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
    name: string
  }>
  error_message?: string
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

type GoogleApiResponse = GooglePlacesTextSearchResponse | GoogleGeocodingResponse

/**
 * Handle common Google API response status codes.
 * Returns an error Result if status indicates failure, null if OK.
 */
function handleApiStatus(
  data: GoogleApiResponse,
  query: string,
  apiName: string
): Result<PlaceLookupResult> | null {
  if (data.status === 'OVER_QUERY_LIMIT') {
    return {
      ok: false,
      error: { type: 'quota', message: `Google ${apiName} API quota exceeded` }
    }
  }
  if (data.status === 'REQUEST_DENIED') {
    return {
      ok: false,
      error: { type: 'auth', message: data.error_message ?? 'Request denied' }
    }
  }
  if (data.status !== 'OK' || data.results.length === 0) {
    return {
      ok: false,
      error: {
        type: 'invalid_response',
        message: `No results found for: ${query}`
      }
    }
  }
  return null // Status OK, continue processing
}

/**
 * Wrap network errors in a consistent Result format.
 */
function wrapNetworkError(error: unknown): Result<PlaceLookupResult> {
  const message = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    error: { type: 'network', message: `Network error: ${message}` }
  }
}

/**
 * Cache a lookup result if cache is provided.
 */
async function cacheResult(
  cache: ResponseCache | undefined,
  cacheKey: string,
  result: PlaceLookupResult
): Promise<void> {
  if (cache) {
    await cache.set(cacheKey, { data: result, cachedAt: Date.now() })
  }
}

/**
 * Fetch from Google API and handle HTTP errors.
 */
async function fetchGoogleApi(
  url: string,
  config: PlaceLookupConfig
): Promise<Result<HttpResponse>> {
  const fetchFn = config.fetch ?? guardedFetch
  const response = (await fetchFn(url)) as unknown as HttpResponse

  if (!response.ok) {
    return {
      ok: false,
      error: {
        type: 'network',
        message: `API error ${response.status}: ${await response.text()}`
      }
    }
  }

  return { ok: true, value: response }
}

/**
 * Build URL params with region bias from config.
 */
function addRegionBias(params: URLSearchParams, config: PlaceLookupConfig): void {
  if (config.regionBias) {
    params.set('region', config.regionBias.toLowerCase())
  } else if (config.defaultCountry) {
    const regionCode = countryToRegionCode(config.defaultCountry)
    if (regionCode) {
      params.set('region', regionCode)
    }
  }
}

/**
 * Look up a place using Google Places Text Search API.
 * Best for venue names, landmarks, and named places.
 * Returns cacheHit=true if result was from cache (no API call made).
 */
async function searchPlace(
  query: string,
  config: PlaceLookupConfig,
  cache?: ResponseCache
): Promise<PlaceLookupInternalResult> {
  const cacheKey = generatePlaceLookupCacheKey('places', query, config.regionBias)
  if (cache) {
    const cached = await cache.get<PlaceLookupResult>(cacheKey)
    if (cached) {
      return { result: { ok: true, value: cached.data }, cacheHit: true }
    }
  }

  const params = new URLSearchParams({ query, key: config.apiKey })
  addRegionBias(params, config)

  try {
    const fetchResult = await fetchGoogleApi(
      `${PLACES_TEXT_SEARCH_API}?${params.toString()}`,
      config
    )
    if (!fetchResult.ok) return { result: fetchResult, cacheHit: false }

    const data = (await fetchResult.value.json()) as GooglePlacesTextSearchResponse
    const statusError = handleApiStatus(data, query, 'Places')
    if (statusError) return { result: statusError, cacheHit: false }

    // Safe to access - handleApiStatus ensures results[0] exists
    const result = data.results[0] as GooglePlacesTextSearchResponse['results'][0]
    const lookupResult: PlaceLookupResult = {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id,
      name: result.name
    }

    await cacheResult(cache, cacheKey, lookupResult)
    return { result: { ok: true, value: lookupResult }, cacheHit: false }
  } catch (error) {
    return { result: wrapNetworkError(error), cacheHit: false }
  }
}

/**
 * Geocode an address using Google Geocoding API.
 * Best for street addresses, cities, regions.
 * Returns cacheHit=true if result was from cache (no API call made).
 */
async function geocodeAddress(
  address: string,
  config: PlaceLookupConfig,
  cache?: ResponseCache
): Promise<PlaceLookupInternalResult> {
  const cacheKey = generatePlaceLookupCacheKey('geocode', address, config.regionBias)
  if (cache) {
    const cached = await cache.get<PlaceLookupResult>(cacheKey)
    if (cached) {
      return { result: { ok: true, value: cached.data }, cacheHit: true }
    }
  }

  const params = new URLSearchParams({ address, key: config.apiKey })
  addRegionBias(params, config)

  try {
    const fetchResult = await fetchGoogleApi(`${GEOCODING_API}?${params.toString()}`, config)
    if (!fetchResult.ok) return { result: fetchResult, cacheHit: false }

    const data = (await fetchResult.value.json()) as GoogleGeocodingResponse
    const statusError = handleApiStatus(data, address, 'Geocoding')
    if (statusError) return { result: statusError, cacheHit: false }

    // Safe to access - handleApiStatus ensures results[0] exists
    const result = data.results[0] as GoogleGeocodingResponse['results'][0]
    const lookupResult: PlaceLookupResult = {
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
      placeId: result.place_id
    }

    await cacheResult(cache, cacheKey, lookupResult)
    return { result: { ok: true, value: lookupResult }, cacheHit: false }
  } catch (error) {
    return { result: wrapNetworkError(error), cacheHit: false }
  }
}

/**
 * Try to extract coordinates from a Google Maps URL in any message.
 */
function tryExtractFromUrl(activity: ClassifiedActivity): PlaceLookupResult | null {
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
 * Look up a place for a single activity.
 *
 * Strategy:
 * 1. Extract coords from Google Maps URL if present
 * 2. If venue is set, use Places API Text Search (for named places)
 * 3. Fall back to Geocoding API (for addresses/cities)
 *
 * Exported for CLI worker pool parallelism.
 * Returns both the geocoded activity AND usage data for metering.
 */
export async function lookupActivityPlace(
  activity: ClassifiedActivity,
  config: PlaceLookupConfig,
  cache?: ResponseCache
): Promise<LookupActivityResult> {
  let usage: PlaceLookupUsage = EMPTY_PLACE_LOOKUP_USAGE

  // First, try to extract coords from Google Maps URL
  const urlCoords = tryExtractFromUrl(activity)
  if (urlCoords) {
    return {
      activity: {
        ...activity,
        latitude: urlCoords.latitude,
        longitude: urlCoords.longitude,
        formattedAddress: urlCoords.formattedAddress || formatLocation(activity) || undefined,
        placeLookupSource: 'google_maps_url'
      },
      usage
    }
  }

  const location = formatLocation(activity)
  if (!location) {
    return { activity, usage }
  }

  // If we have a placeName or placeQuery, use Places API Text Search (better for named places/venues)
  if (activity.placeName || activity.placeQuery) {
    const { result, cacheHit } = await searchPlace(location, config, cache)
    if (!cacheHit) {
      usage = { ...usage, placesSearchCalls: usage.placesSearchCalls + 1 }
    }

    if (result.ok) {
      return {
        activity: {
          ...activity,
          latitude: result.value.latitude,
          longitude: result.value.longitude,
          formattedAddress: result.value.formattedAddress,
          placeId: result.value.placeId,
          placeLookupSource: 'places_api',
          isVenuePlaceId: true
        },
        usage
      }
    }
  }

  // Fall back to Geocoding API (better for addresses/cities)
  const geocode = await geocodeAddress(location, config, cache)
  if (!geocode.cacheHit) {
    usage = { ...usage, geocodingCalls: usage.geocodingCalls + 1 }
  }

  if (geocode.result.ok) {
    return {
      activity: {
        ...activity,
        latitude: geocode.result.value.latitude,
        longitude: geocode.result.value.longitude,
        formattedAddress: geocode.result.value.formattedAddress,
        placeId: geocode.result.value.placeId,
        placeLookupSource: 'geocoding_api',
        isVenuePlaceId: false
      },
      usage
    }
  }

  // If location lookup fails, try searching the activity text as a place
  const activitySearch = await searchPlace(activity.activity, config, cache)
  if (!activitySearch.cacheHit) {
    usage = { ...usage, placesSearchCalls: usage.placesSearchCalls + 1 }
  }

  if (activitySearch.result.ok) {
    return {
      activity: {
        ...activity,
        latitude: activitySearch.result.value.latitude,
        longitude: activitySearch.result.value.longitude,
        formattedAddress: activitySearch.result.value.formattedAddress,
        placeId: activitySearch.result.value.placeId,
        placeLookupSource: 'places_api',
        isVenuePlaceId: true
      },
      usage
    }
  }

  // Could not look up - return without coordinates
  return { activity, usage }
}

/**
 * Look up places for all activities.
 * Returns activities with coordinates AND total usage data for metering.
 */
export async function lookupActivityPlaces(
  activities: readonly ClassifiedActivity[],
  config: PlaceLookupConfig,
  cache?: ResponseCache
): Promise<LookupActivitiesResult> {
  const results: GeocodedActivity[] = []
  let totalUsage: PlaceLookupUsage = EMPTY_PLACE_LOOKUP_USAGE

  for (const activity of activities) {
    const { activity: geocoded, usage } = await lookupActivityPlace(activity, config, cache)
    results.push(geocoded)
    totalUsage = addPlaceLookupUsage(totalUsage, usage)
  }

  return { activities: results, usage: totalUsage }
}

/**
 * Look up a single location string.
 * Uses Places API Text Search.
 * Note: Does not return usage data - use lookupActivityPlace for metering.
 */
export async function lookupPlace(
  query: string,
  config: PlaceLookupConfig
): Promise<Result<PlaceLookupResult>> {
  const { result } = await searchPlace(query, config)
  return result
}

/**
 * Count activities with coordinates.
 */
export function countWithCoordinates(activities: readonly GeocodedActivity[]): number {
  return activities.filter((a) => a.latitude !== undefined && a.longitude !== undefined).length
}

/**
 * Filter to only activities with coordinates.
 */
export function filterWithCoordinates(activities: readonly GeocodedActivity[]): GeocodedActivity[] {
  return activities.filter(
    (a): a is GeocodedActivity & { latitude: number; longitude: number } =>
      a.latitude !== undefined && a.longitude !== undefined
  )
}

/**
 * Calculate the center point of activities with coordinates.
 */
export function calculateCenter(
  activities: readonly GeocodedActivity[]
): { lat: number; lng: number } | null {
  const withCoords = filterWithCoordinates(activities)

  if (withCoords.length === 0) {
    return null
  }

  const sumLat = withCoords.reduce((sum, a) => sum + (a.latitude as number), 0)
  const sumLng = withCoords.reduce((sum, a) => sum + (a.longitude as number), 0)

  return {
    lat: sumLat / withCoords.length,
    lng: sumLng / withCoords.length
  }
}
