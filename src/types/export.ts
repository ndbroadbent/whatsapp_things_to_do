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
  /** Link to source page */
  readonly url: string
  /** License short name (e.g., "CC-BY-SA 4.0") */
  readonly license?: string
  /** Source platform (for formatting display text) */
  readonly source: 'wikipedia' | 'unsplash' | 'pixabay' | 'media_library' | 'other'
}

export interface MapConfig {
  readonly title?: string
  readonly centerLat?: number
  readonly centerLng?: number
  readonly zoom?: number
  readonly clusterMarkers?: boolean
  readonly colorBySender?: boolean
  /** Image paths keyed by activity ID (relative paths like "images/abc123.jpg") */
  readonly imagePaths?: Map<string, string> | undefined
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
