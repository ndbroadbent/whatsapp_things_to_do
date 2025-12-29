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
/**
 * Original source of the image (for attribution).
 */
export type ImageSource =
  | 'unsplash' // Unsplash photos
  | 'unsplash+' // Unsplash+ (no attribution required)
  | 'pixabay' // Pixabay stock photos
  | 'wikipedia' // Wikipedia/Wikimedia Commons
  | 'google_places' // Google Places Photos API
  | 'user_upload' // User-provided replacement image

/**
 * Image metadata - matches the -meta.json format from media library.
 * All image sources (Pixabay API, Wikipedia, media library) return this format.
 */
export interface ImageMeta {
  /** Original source (pixabay, unsplash, wikipedia, etc.) */
  readonly source: ImageSource
  /** URL to the source page */
  readonly url: string
  /** License name (e.g., "Pixabay License", "CC-BY-SA 4.0") */
  readonly license?: string | undefined
  /** URL to license text */
  readonly license_url?: string | undefined
  /** Attribution info */
  readonly attribution?:
    | {
        /** Artist/photographer name */
        readonly name: string
        /** Link to artist's profile page */
        readonly url: string
      }
    | undefined
}

/**
 * Result of fetching an image for an activity.
 */
export interface ImageResult {
  /** URL to the actual image file */
  readonly imageUrl: string

  /** Image data (for embedding in PDF) */
  readonly data?: Uint8Array | undefined

  /** Image dimensions */
  readonly width?: number | undefined
  readonly height?: number | undefined

  /** Metadata (source, attribution, license) - matches -meta.json format */
  readonly meta: ImageMeta

  /** Search query used (for debugging) */
  readonly query?: string | undefined

  /** Whether this image came from the media library (pre-sized versions available) */
  readonly fromMediaLibrary?: boolean | undefined
}

/**
 * Configuration for image fetching.
 */
export interface ImageFetchConfig {
  /**
   * Path to local media library.
   * If set, images/metadata are loaded from disk.
   * If not set, uses remote CDN (media.chattomap.com).
   */
  readonly mediaLibraryPath?: string | undefined

  /** Skip media library entirely (--no-media-library) */
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
