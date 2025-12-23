/**
 * Image Types
 *
 * Types for image fetching and results.
 */

/**
 * Sources for activity images, in priority order.
 */
export type ImageSource =
  | 'scraped' // OG image from scraped URL
  | 'google_places' // Google Places Photos API
  | 'wikipedia' // Wikipedia/Wikimedia Commons
  | 'pixabay' // Pixabay stock photos
  | 'fallback' // Category emoji/icon

/**
 * Result of fetching an image for an activity.
 */
export interface ImageResult {
  /** URL to the image */
  readonly url: string

  /** Image data (for embedding in PDF) */
  readonly data?: Uint8Array

  /** Image dimensions */
  readonly width?: number
  readonly height?: number

  /** Source that provided the image */
  readonly source: ImageSource

  /** Attribution info (required for some sources) */
  readonly attribution?: {
    readonly name: string
    readonly url: string
  }
}

/**
 * Configuration for image fetching.
 */
export interface ImageFetchConfig {
  /** Skip Pixabay image search */
  readonly skipPixabay?: boolean

  /** Skip Wikipedia image lookup */
  readonly skipWikipedia?: boolean

  /** Skip Google Places Photos */
  readonly skipGooglePlaces?: boolean

  /** Pixabay API key */
  readonly pixabayApiKey?: string

  /** Google Places API key */
  readonly googlePlacesApiKey?: string
}
