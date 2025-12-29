/**
 * Image Types
 *
 * Types for image fetching and results.
 *
 * ⚠️ LEGAL NOTICE: 'scraped' is NOT a valid source.
 * OpenGraph images can ONLY be used for inline link previews.
 * Using them as activity images = copyright infringement.
 * See project_docs/IMAGES.md for full licensing rules.
 */

/**
 * Sources for activity images, in priority order.
 *
 * NOTE: 'scraped'/'og' is intentionally NOT included.
 * OG images can only be displayed as link previews within message context.
 */
export type ImageSource =
  | 'media_library' // ChatToMap media library (curated images)
  | 'cdn' // ChatToMap CDN default image (deprecated, use media_library)
  | 'google_places' // Google Places Photos API
  | 'wikipedia' // Wikipedia/Wikimedia Commons
  | 'pixabay' // Pixabay stock photos
  | 'user_upload' // User-provided replacement image

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
        /** Artist/photographer name */
        readonly name: string
        /** Link to source page (Wikimedia Commons, Unsplash, etc.) */
        readonly url: string
        /** License short name (e.g., "CC-BY-SA 4.0") - required for Wikipedia */
        readonly license?: string | undefined
        /** Link to license text */
        readonly licenseUrl?: string | undefined
      }
    | undefined

  /** Search query used (for Pixabay debugging) */
  readonly query?: string | undefined
}

/**
 * Configuration for image fetching.
 */
export interface ImageFetchConfig {
  /** Skip CDN default images (--no-image-cdn) - deprecated, use skipMediaLibrary */
  readonly skipCdn?: boolean | undefined

  /** Skip media library (curated images from media.chattomap.com) */
  readonly skipMediaLibrary?: boolean | undefined

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

  /**
   * Local path to media library images directory.
   * If provided, images are loaded from disk instead of CDN.
   * Example: "/path/to/media_library/images"
   */
  readonly mediaLibraryPath?: string | undefined

  /**
   * Country code for regional synonym overrides.
   * Example: "US", "AU", "NZ"
   */
  readonly countryCode?: string | undefined
}

/**
 * Metadata for an image in the media library.
 */
export interface ImageMetadata {
  /** Original filename before SHA256 rename */
  readonly original_filename?: string | undefined

  /** Image dimensions */
  readonly width?: number | undefined
  readonly height?: number | undefined
  readonly file_size?: number | undefined
  readonly format?: string | undefined

  /** Source platform */
  readonly source?: 'unsplash' | 'pixabay' | 'pexels' | 'wikimedia' | 'other' | undefined
  readonly url?: string | undefined

  /** License info */
  readonly license?: string | undefined
  readonly license_url?: string | undefined

  /** Attribution */
  readonly attribution?:
    | {
        readonly name?: string | undefined
        readonly url?: string | undefined
      }
    | undefined

  /** Content metadata */
  readonly description?: string | undefined
  readonly keywords?: readonly string[] | undefined
}
