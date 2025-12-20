/**
 * Classifier Types
 *
 * Types for AI classification and aggregation.
 */

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

/** Emoji for each activity category. */
export const CATEGORY_EMOJI: Record<ActivityCategory, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  bar: '🍺',
  hike: '🥾',
  nature: '🌲',
  beach: '🏖️',
  trip: '✈️',
  hotel: '🏨',
  event: '🎉',
  concert: '🎵',
  museum: '🏛️',
  entertainment: '🎬',
  adventure: '🎢',
  family: '👨‍👩‍👧',
  errand: '📋',
  appointment: '📅',
  other: '📍'
}

export interface ClassifiedSuggestion {
  readonly messageId: number
  readonly isActivity: boolean
  readonly activity: string
  readonly location?: string | undefined
  readonly activityScore: number
  readonly category: ActivityCategory
  readonly confidence: number
  readonly originalMessage: string
  readonly sender: string
  readonly timestamp: Date
  /**
   * Whether this activity has a specific location that can be geocoded.
   * - true: Mappable (specific place like "Queenstown", "Coffee Lab", Google Maps URL)
   * - false: General activity idea without location (like "see a movie", "go kayaking")
   */
  readonly isMappable: boolean
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

export interface CacheCheckInfo {
  readonly batchIndex: number
  readonly cacheKey: string
  readonly hit: boolean
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
  /** Called after cache check. Use for debug logging. */
  readonly onCacheCheck?: (info: CacheCheckInfo) => void
}

export interface ClassifierResponse {
  readonly message_id: number
  readonly is_activity: boolean
  readonly activity: string | null
  readonly location: string | null
  readonly activity_score: number
  readonly category: string
  readonly confidence: number
  /** Whether this activity can be geocoded to a map location. */
  readonly is_mappable: boolean
}

/** A single message that mentioned an activity/location. */
export interface SourceMessage {
  readonly messageId: number
  readonly content: string
  readonly sender: string
  readonly timestamp: Date
  readonly context?: string | undefined
}

/** An aggregated suggestion combining multiple mentions of the same activity/location. */
export interface AggregatedSuggestion extends ClassifiedSuggestion {
  readonly mentionCount: number
  readonly firstMentionedAt: Date
  readonly lastMentionedAt: Date
  readonly sourceMessages: readonly SourceMessage[]
}
