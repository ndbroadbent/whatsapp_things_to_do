/**
 * Place Lookup Types
 *
 * Types for looking up places and getting coordinates.
 */

import type { ClassifiedActivity } from './classifier'

export type PlaceLookupSource = 'google_maps_url' | 'places_api' | 'geocoding_api'

export interface GeocodedActivity extends ClassifiedActivity {
  readonly latitude?: number | undefined
  readonly longitude?: number | undefined
  readonly formattedAddress?: string | undefined
  readonly placeId?: string | undefined
  readonly placeLookupSource?: PlaceLookupSource | undefined
  /** True if placeId is for a specific venue (not just a city/region) */
  readonly isVenuePlaceId?: boolean | undefined
}

export interface PlaceLookupConfig {
  readonly apiKey: string
  readonly regionBias?: string | undefined
  readonly defaultCountry?: string | undefined
  /** Custom fetch function for testing */
  readonly fetch?: typeof fetch | undefined
}

export interface PlaceLookupResult {
  readonly latitude: number
  readonly longitude: number
  readonly formattedAddress: string
  readonly placeId?: string | undefined
  readonly name?: string | undefined
}
