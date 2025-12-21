/**
 * Geocoder Types
 *
 * Types for geocoding and location data.
 */

import type { ClassifiedActivity } from './classifier.js'

export type GeocodeSource = 'google_maps_url' | 'google_geocoding' | 'place_search'

export interface GeocodedActivity extends ClassifiedActivity {
  readonly latitude?: number | undefined
  readonly longitude?: number | undefined
  readonly formattedAddress?: string | undefined
  readonly placeId?: string | undefined
  readonly geocodeSource?: GeocodeSource | undefined
}

export interface GeocoderConfig {
  readonly apiKey: string
  readonly regionBias?: string | undefined
  readonly defaultCountry?: string | undefined
}

export interface GeocodeResult {
  readonly latitude: number
  readonly longitude: number
  readonly formattedAddress: string
  readonly placeId?: string | undefined
}
