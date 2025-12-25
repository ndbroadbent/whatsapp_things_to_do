/**
 * Extractor Types
 *
 * Types for candidate extraction and activity links.
 */

import type { UrlType } from './parser'

/** Query type for semantic matches. */
export type QueryType = 'suggestion' | 'agreement'

export type CandidateSource =
  | { readonly type: 'regex'; readonly pattern: string }
  | { readonly type: 'url'; readonly urlType: UrlType }
  | {
      readonly type: 'semantic'
      readonly similarity: number
      readonly query: string
      readonly queryType: QueryType
    }

/** A message in the context window around a candidate. */
export interface ContextMessage {
  readonly id: number
  readonly sender: string
  readonly content: string
  readonly timestamp: Date
}

export interface CandidateMessage {
  readonly messageId: number
  readonly content: string
  readonly sender: string
  readonly timestamp: Date
  readonly source: CandidateSource
  readonly confidence: number
  /** Whether this is a suggestion (proposing activity) or agreement (positive response). */
  readonly candidateType: QueryType
  /** Messages before the target (for classifier context). */
  readonly contextBefore: readonly ContextMessage[]
  /** Messages after the target (for classifier context). */
  readonly contextAfter: readonly ContextMessage[]
  readonly urls?: readonly string[] | undefined
}

export interface ExtractorOptions {
  readonly minConfidence?: number
  readonly includeUrlBased?: boolean
  readonly additionalPatterns?: readonly RegExp[]
  readonly additionalExclusions?: readonly RegExp[]
  /**
   * Skip agreement deduplication. Used by extractCandidates() when calling
   * child extractors, since it deduplicates the merged result itself.
   */
  readonly skipAgreementDeduplication?: boolean
  /**
   * Proximity range for agreement deduplication.
   * If an agreement candidate is within this many messages of a suggestion,
   * the agreement is dropped (the suggestion contains the activity details).
   * Default: 5
   */
  readonly agreementProximity?: number
}

export interface ExtractorResult {
  readonly candidates: readonly CandidateMessage[]
  readonly regexMatches: number
  readonly urlMatches: number
  readonly totalUnique: number
  /** Number of agreement candidates removed due to overlap with suggestions. */
  readonly agreementsRemoved?: number
}

/** Inferred type for an activity link based on context analysis. */
export type ActivityLinkType = 'place' | 'activity' | 'event' | 'idea' | 'unknown'

/** Social platform type for activity links. */
export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'facebook'
  | 'google_maps'
  | 'airbnb'
  | 'booking'
  | 'tripadvisor'
  | 'eventbrite'
  | 'reddit'
  | 'other'

/** Context surrounding an activity link in the chat. */
export interface ActivityLinkContext {
  /** Messages before the link (+-2 messages) */
  readonly before: readonly string[]
  /** Messages after the link (+-2 messages) */
  readonly after: readonly string[]
  /** Sender who shared the link */
  readonly sender: string
  /** Timestamp when the link was shared */
  readonly timestamp: Date
  /** The full message content containing the link */
  readonly messageContent: string
}

/** Intent signals detected from context around an activity link. */
export interface IntentSignals {
  /** High-signal keywords found (e.g., "go", "try", "visit") */
  readonly keywords: readonly string[]
  /** High-signal emojis found (e.g., fire, heart eyes) */
  readonly emojis: readonly string[]
  /** Combined intent score from 0.0 to 1.0 */
  readonly score: number
}

/** Optional metadata scraped from the linked content. Best-effort - may not be available. */
export interface ActivityLinkMetadata {
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly thumbnail?: string | undefined
  readonly creator?: string | undefined
}

/** An activity link extracted from chat - a social media or web link representing a place/activity. */
export interface ActivityLink {
  readonly url: string
  readonly platform: SocialPlatform
  readonly confidence: number
  readonly inferredType: ActivityLinkType
  readonly context: ActivityLinkContext
  readonly intent: IntentSignals
  readonly metadata?: ActivityLinkMetadata | undefined
  readonly messageId: number
}

/** Result from extracting activity links from messages. */
export interface ActivityLinkResult {
  readonly links: readonly ActivityLink[]
  readonly totalUrls: number
  readonly activityLinkCount: number
}
