/**
 * Place Lookup Types
 *
 * Types for looking up places and getting coordinates.
 */

import type { FetchFn } from '../scraper/types'
import type { ClassifiedActivity } from './classifier'

export type PlaceLookupSource = 'google_maps_url' | 'places_api' | 'geocoding_api'

/**
 * Link preview metadata for display in exports.
 * Can come from either entity resolution (IMDb, Wikipedia) or OG scraping (user-pasted URLs).
 */
export interface LinkPreview {
  /** Canonical URL to link to */
  readonly url: string
  /** Page title from og:title or entity resolution */
  readonly title: string | null
  /** Description from og:description or entity data */
  readonly description: string | null
  /** Image URL from og:image (for preview widget, NOT activity thumbnail) */
  readonly imageUrl: string | null
  /** Domain for display (e.g., "imdb.com") */
  readonly domain: string
  /** How this preview was obtained */
  readonly source: 'resolved' | 'scraped'
  /** Entity type if resolved (movie, book, etc.) */
  readonly entityType?: string | undefined
  /** External IDs if resolved (imdb, goodreads, etc.) */
  readonly externalIds?: Readonly<Record<string, string>> | undefined
}

export interface GeocodedActivity extends ClassifiedActivity {
  readonly latitude?: number | undefined
  readonly longitude?: number | undefined
  readonly formattedAddress?: string | undefined
  readonly placeId?: string | undefined
  readonly placeLookupSource?: PlaceLookupSource | undefined
  /** True if placeId is for a specific venue (not just a city/region) */
  readonly isVenuePlaceId?: boolean | undefined
  /** Resolved canonical URL (before OG metadata is scraped) */
  readonly resolvedUrl?: string | undefined
  /** Link preview data for exports (after OG metadata is scraped) */
  readonly linkPreview?: LinkPreview | undefined
}

export interface PlaceLookupConfig {
  readonly apiKey: string
  readonly regionBias?: string | undefined
  readonly defaultCountry?: string | undefined
  /** Custom fetch function for testing */
  readonly fetch?: FetchFn | undefined
}

export interface PlaceLookupResult {
  readonly latitude: number
  readonly longitude: number
  readonly formattedAddress: string
  readonly placeId?: string | undefined
  readonly name?: string | undefined
}
