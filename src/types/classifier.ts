/**
 * Classifier Types
 *
 * Types for AI classification and aggregation.
 */

export type { ActivityCategory } from '../classifier/categories'
// Re-export from categories (source of truth)
export { CATEGORY_EMOJI, VALID_CATEGORIES } from '../classifier/categories'

import type { ActivityCategory } from '../classifier/categories'

export interface ClassifiedActivity {
  readonly messageId: number
  /** Human-readable activity title */
  readonly activity: string
  /** How fun/enjoyable is this activity? 0=boring, 1=exciting */
  readonly funScore: number
  /** How interesting/unique is this activity? 0=common/mundane, 1=rare/novel */
  readonly interestingScore: number
  readonly category: ActivityCategory
  readonly confidence: number
  readonly originalMessage: string
  readonly sender: string
  readonly timestamp: Date
  /**
   * Whether this is a generic activity (no specific name, URL, or compound structure).
   * Generic activities are more likely to cluster with similar ones.
   */
  readonly isGeneric: boolean
  /**
   * Whether this is a compound/complex activity that JSON can't fully capture.
   * Compound activities (e.g., "Go to Iceland and see the aurora") stay as singletons.
   */
  readonly isCompound: boolean
  /** Normalized action verb/noun (e.g., "hike" not "tramping") */
  readonly action: string | null
  /** Original action word before normalization */
  readonly actionOriginal: string | null
  /** Normalized object (e.g., "movie" not "film") */
  readonly object: string | null
  /** Original object word before normalization */
  readonly objectOriginal: string | null
  /** Venue/place name (e.g., "Coffee Lab", "Kazuya") */
  readonly venue: string | null
  /** City name (e.g., "Queenstown", "Auckland") */
  readonly city: string | null
  /** Region name (state, province, prefecture) */
  readonly region: string | null
  /** Country name */
  readonly country: string | null
}

/**
 * Check if an activity has a mappable location.
 * Derived from venue/city/region/country fields.
 */
export function isMappable(a: ClassifiedActivity): boolean {
  return !!(a.venue || a.city || a.region || a.country)
}

/**
 * Format location from structured fields for display.
 * Returns a human-readable string like "Coffee Lab, Auckland, New Zealand"
 * or null if no location fields are set.
 */
export function formatLocation(a: ClassifiedActivity): string | null {
  const parts = [a.venue, a.city, a.region, a.country].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

/** Provider type for AI classification APIs. */
export type ClassifierProvider = 'anthropic' | 'openai' | 'openrouter'

/** Configuration for a single provider (used for fallbacks). */
export interface ProviderConfig {
  readonly provider: ClassifierProvider
  readonly apiKey: string
  readonly model?: string
}

export interface BatchInfo {
  readonly batchIndex: number
  readonly totalBatches: number
  readonly candidateCount: number
  readonly model: string
  readonly provider: ClassifierProvider
}

export interface BatchCompleteInfo {
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
}

/**
 * Raw JSON response from the LLM classifier.
 * Uses short keys to minimize token usage.
 */
export interface ClassifierResponse {
  /** Message ID */
  readonly msg: number
  /** Human-readable activity title */
  readonly title: string | null
  /** Activity score (0.0 = errand, 1.0 = fun) */
  readonly score: number
  /** Category (hike, restaurant, trip, etc.) */
  readonly cat: string
  /** Confidence score */
  readonly conf: number
  /** Is mappable (has specific location)? */
  readonly map: boolean
  /** Is generic (no specific name/URL/compound)? */
  readonly gen: boolean
  /** Is complete (JSON data fully captures info, not lossy)? */
  readonly com: boolean
  /** Normalized action (hike, not tramping/trekking) */
  readonly act: string | null
  /** Original action word before normalization */
  readonly act_orig: string | null
  /** Normalized object (movie, not film) */
  readonly obj: string | null
  /** Original object word before normalization */
  readonly obj_orig: string | null
  /** Venue/place name (Coffee Lab, Kazuya) */
  readonly loc: string | null
  /** City name */
  readonly city: string | null
  /** State/region name */
  readonly state: string | null
  /** Country name */
  readonly country: string | null
  /** Original location string before parsing */
  readonly loc_orig: string | null
}

/** A single message that mentioned an activity/location. */
export interface SourceMessage {
  readonly messageId: number
  readonly content: string
  readonly sender: string
  readonly timestamp: Date
  readonly context?: string | undefined
}

/** An aggregated activity combining multiple mentions of the same activity/location. */
export interface AggregatedActivity extends ClassifiedActivity {
  readonly mentionCount: number
  readonly firstMentionedAt: Date
  readonly lastMentionedAt: Date
  readonly sourceMessages: readonly SourceMessage[]
}
