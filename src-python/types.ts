/**
 * Core types for ChatToMap library
 */

// ============================================================================
// Parser Types
// ============================================================================

export type MediaType = 'image' | 'video' | 'audio' | 'gif' | 'sticker' | 'document' | 'contact'

export interface ParsedMessage {
  id: number
  timestamp: Date
  sender: string
  content: string
  rawLine: string
  hasMedia: boolean
  mediaType?: MediaType
  urls?: string[]
}

export type UrlType =
  | 'google_maps'
  | 'tiktok'
  | 'youtube'
  | 'instagram'
  | 'airbnb'
  | 'booking'
  | 'tripadvisor'
  | 'event'
  | 'website'

export interface ParserOptions {
  format?: 'ios' | 'android' | 'auto'
  timezone?: string
}

// ============================================================================
// Extractor Types
// ============================================================================

export type CandidateSource =
  | { type: 'regex'; pattern: string }
  | { type: 'url'; urlType: UrlType }
  | { type: 'semantic'; similarity: number; query: string }

export interface CandidateMessage {
  messageId: number
  content: string
  sender: string
  timestamp: Date
  source: CandidateSource
  confidence: number
  context?: string
}

export interface ExtractorOptions {
  minConfidence?: number
  includeUrlBased?: boolean
  additionalPatterns?: RegExp[]
  additionalExclusions?: RegExp[]
}

// ============================================================================
// Embeddings Types
// ============================================================================

export interface EmbeddingConfig {
  apiKey: string
  model?: string
  batchSize?: number
}

export interface EmbeddedMessage {
  messageId: number
  content: string
  embedding: Float32Array
}

export interface SemanticSearchConfig {
  queries?: string[]
  topK?: number
  minSimilarity?: number
}

// ============================================================================
// Classifier Types
// ============================================================================

export type ActivityCategory =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'hike'
  | 'nature'
  | 'beach'
  | 'trip'
  | 'hotel'
  | 'event'
  | 'concert'
  | 'museum'
  | 'entertainment'
  | 'adventure'
  | 'family'
  | 'errand'
  | 'appointment'
  | 'other'

export interface ClassifiedSuggestion {
  messageId: number
  isActivity: boolean
  activity: string
  location?: string
  activityScore: number
  category: ActivityCategory
  confidence: number
  originalMessage: string
  sender: string
  timestamp: Date
}

export interface ClassifierConfig {
  provider: 'anthropic' | 'openai' | 'openrouter'
  apiKey: string
  model?: string
  batchSize?: number
  contextChars?: number
}

// ============================================================================
// Geocoder Types
// ============================================================================

export type GeocodeSource = 'google_maps_url' | 'google_geocoding' | 'place_search'

export interface GeocodedSuggestion extends ClassifiedSuggestion {
  latitude?: number
  longitude?: number
  formattedAddress?: string
  placeId?: string
  geocodeSource?: GeocodeSource
}

export interface GeocoderConfig {
  apiKey: string
  regionBias?: string
  defaultCountry?: string
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  formattedAddress: string
  placeId?: string
}

// ============================================================================
// Export Types
// ============================================================================

export interface MapConfig {
  title?: string
  centerLat?: number
  centerLng?: number
  zoom?: number
  clusterMarkers?: boolean
  colorBySender?: boolean
}

export interface PDFConfig {
  title?: string
  subtitle?: string
  includeMap?: boolean
  filterByCategory?: ActivityCategory[]
  filterByRegion?: string
}

// ============================================================================
// Result Types
// ============================================================================

export type ApiErrorType = 'rate_limit' | 'auth' | 'quota' | 'network' | 'invalid_response'

export interface ApiError {
  type: ApiErrorType
  message: string
  retryAfter?: number
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError }
