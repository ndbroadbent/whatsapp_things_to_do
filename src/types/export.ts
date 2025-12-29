/**
 * Export Types
 *
 * Types for export formats (CSV, Excel, JSON, Map, PDF).
 */

import type { ActivityCategory } from './classifier'

/** Available map tile styles */
export type MapStyle = 'osm' | 'satellite' | 'terrain'

/** Image attribution info for map display */
export interface ImageAttribution {
  /** Artist/photographer name */
  readonly name: string
  /** Link to the photo page */
  readonly photoUrl: string
  /** Link to the author's profile (may be undefined for Google Places) */
  readonly authorUrl: string | undefined
  /** License (only for Wikipedia) */
  readonly license: string | undefined
  /** Source platform */
  readonly source: 'wikipedia' | 'unsplash' | 'pixabay' | 'google_places'
}

export interface MapConfig {
  readonly title?: string
  readonly centerLat?: number
  readonly centerLng?: number
  readonly zoom?: number
  readonly clusterMarkers?: boolean
  readonly colorBySender?: boolean
  /** Thumbnail paths (128×128) keyed by activity ID */
  readonly imagePaths?: Map<string, string> | undefined
  /** Medium image paths (400×267) keyed by activity ID - for popup */
  readonly mediumImagePaths?: Map<string, string> | undefined
  /** Lightbox image paths (1400×933) keyed by activity ID */
  readonly lightboxImagePaths?: Map<string, string> | undefined
  /** Image attributions keyed by activity ID */
  readonly imageAttributions?: Map<string, ImageAttribution> | undefined
  /** Default map tile style (default: 'osm') */
  readonly defaultStyle?: MapStyle
}

/** Sort order for export filtering. */
export type SortOrder = 'score' | 'oldest' | 'newest'

export interface PDFConfig {
  readonly title?: string
  readonly subtitle?: string
  readonly includeMap?: boolean
  readonly filterByCategory?: readonly ActivityCategory[]
  readonly filterByCountry?: readonly string[]
  /** Thumbnails keyed by activity ID (JPEG buffers, 225px square at 300 DPI) */
  readonly thumbnails?: Map<string, Buffer> | undefined
  /** Include thumbnails in PDF (default: false to save ink) */
  readonly includeThumbnails?: boolean
  /** Max activities to include (0 or undefined = all) */
  readonly maxActivities?: number
  /** Sort order when limiting activities (default: score) */
  readonly sortOrder?: SortOrder
  /** Group activities by country (default: true) */
  readonly groupByCountry?: boolean
  /** Group activities by category (default: true) */
  readonly groupByCategory?: boolean
  /** Include score in activity output (default: false) */
  readonly includeScore?: boolean
  /** Page size: A4 or Letter (default: based on home country) */
  readonly pageSize?: 'A4' | 'Letter'
}

export interface ExportMetadata {
  readonly version: string
  readonly generatedAt: Date
  readonly inputFile?: string | undefined
  readonly messageCount: number
  readonly activityCount: number
  readonly geocodedCount: number
}
