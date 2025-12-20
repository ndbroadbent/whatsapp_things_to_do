/**
 * Export Types
 *
 * Types for export formats (CSV, Excel, JSON, Map, PDF).
 */

import type { ActivityCategory } from './classifier.js'

export interface MapConfig {
  readonly title?: string
  readonly centerLat?: number
  readonly centerLng?: number
  readonly zoom?: number
  readonly clusterMarkers?: boolean
  readonly colorBySender?: boolean
}

export interface PDFConfig {
  readonly title?: string
  readonly subtitle?: string
  readonly includeMap?: boolean
  readonly filterByCategory?: readonly ActivityCategory[]
  readonly filterByRegion?: string
}

export interface ExportMetadata {
  readonly version: string
  readonly generatedAt: Date
  readonly inputFile?: string | undefined
  readonly messageCount: number
  readonly suggestionCount: number
  readonly geocodedCount: number
}
