/**
 * Classifier Types
 *
 * Types for AI classification and aggregation.
 */

export type { ActivityCategory } from '../categories'
// Re-export from categories (source of truth)
export { CATEGORY_EMOJI, VALID_CATEGORIES } from '../categories'

import type { ActivityCategory } from '../categories'
import type { ScrapedMetadata } from '../scraper/types'
import type { EntityType } from '../search/types'

/** A message that mentioned this activity. */
export interface ActivityMessage {
  readonly id: number
  readonly timestamp: Date
  readonly sender: string
  readonly message: string
}

/**
 * Image hints for the banner image pipeline.
 * Non-location image hints only (locations are top-level).
 *
 * Pipeline order:
 * 1. If preferStock=false: try mediaKey in library first
 * 2. Try stock photo API (Pixabay/Pexels)
 * 3. If preferStock=true: try mediaKey in library as fallback
 * 4. Fall back to category default
 */
export interface ClassifiedImageHints {
  /** Stock photo query string (e.g., "hot air balloon cappadocia sunrise"). ALWAYS required. */
  readonly stock: string
  /** Media library key (e.g., "hot air balloon", "restaurant", "concert") */
  readonly mediaKey: string | null
  /**
   * When true: stock is preferred, mediaKey is fallback (for location-specific activities)
   * When false/omitted: mediaKey is tried first, stock is fallback (for generic activities)
   */
  readonly preferStock?: boolean
}

/**
 * Link hints for generating clickable link widgets.
 * Used to resolve media entities (movies, books, games, etc.) to canonical URLs.
 */
export interface ClassifiedLinkHints {
  /** Entity type for resolution (movie, book, video_game, etc.) */
  readonly type: EntityType
  /** Canonical title/name to search for (e.g., "The Matrix", "Project Hail Mary") */
  readonly query: string
}

export interface ClassifiedActivity {
  /** Unique activity ID (16-char hash of all fields) */
  readonly activityId: string
  /** Human-readable activity title */
  readonly activity: string
  /** How fun/enjoyable is this activity? 0.0-5.0 scale (averaged across all messages) */
  readonly funScore: number
  /** How interesting/unique is this activity? 0.0-5.0 scale (averaged across all messages) */
  readonly interestingScore: number
  /** Combined score 0.0-5.0, derived from interestingScore and funScore via calculateCombinedScore() */
  readonly score: number
  readonly category: ActivityCategory
  /** All messages that mentioned this activity (1 initially, more after deduplication) */
  readonly messages: readonly ActivityMessage[]

  // ===== Location fields (top-level, for geocoding + sometimes images) =====
  /** Wikipedia topic name for "things" (bands, board games, concepts) - NOT places */
  readonly wikiName: string | null
  /** Canonical named place with Wikipedia article (e.g., "Waiheke Island", "Mount Fuji") */
  readonly placeName: string | null
  /** Business/POI disambiguation string for Google Places (e.g., "Dice Goblin Auckland") */
  readonly placeQuery: string | null
  /** City name (e.g., "Queenstown", "Auckland") */
  readonly city: string | null
  /** Region name (state, province, prefecture) */
  readonly region: string | null
  /** Country name */
  readonly country: string | null

  // ===== Image hints (non-location) =====
  /** Hints for the banner image pipeline */
  readonly image: ClassifiedImageHints

  // ===== Link hints (optional) =====
  /** Hints for generating clickable link widgets */
  readonly link: ClassifiedLinkHints | null
}

/**
 * Calculate combined score from funScore and interestingScore.
 * Weights interesting 2x, normalizes to 0-5 range, rounds to 1 decimal.
 */
export function calculateCombinedScore(funScore: number, interestingScore: number): number {
  return Math.round(((interestingScore * 2 + funScore) / 3) * 10) / 10
}

/**
 * Check if an activity has a mappable location.
 * Derived from location fields (placeName, placeQuery, city, region, country).
 */
export function isMappable(a: ClassifiedActivity): boolean {
  return !!(a.placeName || a.placeQuery || a.city || a.region || a.country)
}

/**
 * Format location from structured fields for display.
 * Returns a human-readable string like "Dice Goblin, Auckland, New Zealand"
 * or null if no location fields are set.
 */
export function formatLocation(a: ClassifiedActivity): string | null {
  const place = a.placeName || a.placeQuery
  const parts = [place, a.city, a.region, a.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** Provider type for AI classification APIs. */
export type ClassifierProvider = 'anthropic' | 'openai' | 'openrouter' | 'google'

/** Configuration for a single provider (used for fallbacks). */
export interface ProviderConfig {
  readonly provider: ClassifierProvider
  readonly apiKey: string
  readonly model?: string
}

interface BatchInfo {
  readonly batchIndex: number
  readonly totalBatches: number
  readonly candidateCount: number
  readonly model: string
  readonly provider: ClassifierProvider
  /** Whether this batch result is from cache */
  readonly fromCache: boolean
}

interface BatchCompleteInfo {
  readonly batchIndex: number
  readonly totalBatches: number
  readonly activityCount: number
  readonly durationMs: number
}

export interface ClassifierConfig {
  readonly provider: ClassifierProvider
  readonly apiKey: string
  /** User's home country (e.g., "New Zealand") - REQUIRED for location disambiguation */
  readonly homeCountry: string
  /** User's timezone (e.g., "Pacific/Auckland") - optional, helps with temporal context */
  readonly timezone?: string | undefined
  readonly model?: string
  readonly batchSize?: number
  readonly contextChars?: number
  /** Max gap between message IDs to consider them in the same discussion. Default: 5 */
  readonly proximityGap?: number
  /** Fallback providers to try on rate limit errors. */
  readonly fallbackProviders?: readonly ProviderConfig[]
  /** Called before each batch API request. Use for logging/progress. */
  readonly onBatchStart?: (info: BatchInfo) => void
  /** Called after each batch completes. Use for progress logging. */
  readonly onBatchComplete?: (info: BatchCompleteInfo) => void
  /** URL metadata to enrich prompts with scraped page info (title, description, redirect URLs) */
  readonly urlMetadata?: Map<string, ScrapedMetadata> | undefined
}
