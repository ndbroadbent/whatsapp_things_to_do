/**
 * Image Types
 *
 * Types for image fetching and results.
 */

/**
 * Sources for activity images, in priority order.
 */
export type ImageSource =
  | 'cdn' // ChatToMap CDN default image
  | 'scraped' // OG image from scraped URL
  | 'google_places' // Google Places Photos API
  | 'wikipedia' // Wikipedia/Wikimedia Commons
  | 'pixabay' // Pixabay stock photos

/**
 * Result of fetching an image for an activity.
 */
export interface ImageResult {
  /** URL to the image */
  readonly url: string

  /** Image data (for embedding in PDF) */
  readonly data?: Uint8Array | undefined

  /** Image dimensions */
  readonly width?: number | undefined
  readonly height?: number | undefined

  /** Source that provided the image */
  readonly source: ImageSource

  /** Attribution info (required for some sources) */
  readonly attribution?:
    | {
        readonly name: string
        readonly url: string
      }
    | undefined
}

/** Scraped metadata for a URL (subset of fields needed for images) */
export interface ScrapedUrlMetadata {
  readonly imageUrl: string | null
  readonly title: string | null
  readonly canonicalUrl: string
}

/**
 * Configuration for image fetching.
 */
export interface ImageFetchConfig {
  /** Skip CDN default images (--no-image-cdn) */
  readonly skipCdn?: boolean | undefined

  /** Skip Pixabay image search */
  readonly skipPixabay?: boolean | undefined

  /** Skip Wikipedia image lookup */
  readonly skipWikipedia?: boolean | undefined

  /** Skip Google Places Photos */
  readonly skipGooglePlaces?: boolean | undefined

  /** Pixabay API key */
  readonly pixabayApiKey?: string | undefined

  /** Google Places API key */
  readonly googlePlacesApiKey?: string | undefined

  /** Scraped URL metadata (keyed by original URL) */
  readonly scrapedMetadata?: Map<string, ScrapedUrlMetadata> | undefined
}
