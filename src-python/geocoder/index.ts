/**
 * Geocoder Module
 *
 * Convert location text to coordinates using Google Maps APIs.
 */

import type {
  ClassifiedSuggestion,
  GeocodedSuggestion,
  GeocodeResult,
  GeocoderConfig
} from '../types.js'

/**
 * Geocode all suggestions that have location information.
 */
export async function geocodeSuggestions(
  suggestions: ClassifiedSuggestion[],
  _config: GeocoderConfig
): Promise<GeocodedSuggestion[]> {
  // TODO: Implement geocoder
  // See src/geocoder.py in Python prototype for reference
  throw new Error(`Not implemented. Suggestion count: ${suggestions.length}`)
}

/**
 * Extract coordinates from Google Maps URLs.
 * Returns null if URL is not a valid Google Maps link or coords cannot be extracted.
 */
export function extractGoogleMapsCoords(url: string): { lat: number; lng: number } | null {
  // TODO: Implement Google Maps URL parsing
  // Patterns to handle:
  // - maps.google.com/maps?q=...
  // - goo.gl/maps/...
  // - maps.app.goo.gl/...
  // - google.com/maps/place/.../@lat,lng,...
  throw new Error(`Not implemented. URL: ${url}`)
}

/**
 * Geocode a text location using Google Geocoding API.
 */
export async function geocodeLocation(
  location: string,
  _config: GeocoderConfig
): Promise<GeocodeResult | null> {
  // TODO: Implement geocoding
  throw new Error(`Not implemented. Location: ${location}`)
}
