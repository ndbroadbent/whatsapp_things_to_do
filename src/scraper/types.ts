/**
 * Scraper Types
 *
 * Types for social media metadata scraping.
 */

import type { SocialPlatform } from '../types.js'

/**
 * Fetch function type for dependency injection.
 */
export type FetchFn = typeof fetch

/**
 * Configuration for the scraper.
 */
export interface ScraperConfig {
  /** User agent string for requests */
  readonly userAgent?: string
  /** Timeout in milliseconds (default: 10000) */
  readonly timeout?: number
  /** Maximum redirects to follow (default: 5) */
  readonly maxRedirects?: number
  /** Rate limit delay between requests in ms (default: 500) */
  readonly rateLimitMs?: number
  /** Custom fetch function for testing/mocking */
  readonly fetch?: FetchFn
}

/**
 * Metadata scraped from a social media URL.
 */
export interface ScrapedMetadata {
  /** The platform this was scraped from */
  readonly platform: SocialPlatform
  /** Canonical URL after resolving redirects */
  readonly canonicalUrl: string
  /** Video/post ID extracted from URL */
  readonly contentId: string | null
  /** Title or first line of description */
  readonly title: string | null
  /** Full description text */
  readonly description: string | null
  /** Hashtags found in the content */
  readonly hashtags: readonly string[]
  /** Creator/author username */
  readonly creator: string | null
  /** Creator/channel ID (platform-specific) */
  readonly creatorId?: string | null
  /** Thumbnail URL if available */
  readonly thumbnailUrl: string | null
  /** Content categories/labels from the platform */
  readonly categories: readonly string[]
  /** Suggested/related keywords */
  readonly suggestedKeywords: readonly string[]
  /** Raw platform-specific data for debugging */
  readonly rawData?: unknown
}

/**
 * Result of a scrape attempt.
 */
export interface ScrapeResult {
  readonly ok: true
  readonly metadata: ScrapedMetadata
}

/**
 * Error from a scrape attempt.
 */
export interface ScrapeError {
  readonly ok: false
  readonly error: {
    readonly type: 'network' | 'parse' | 'blocked' | 'not_found' | 'unsupported'
    readonly message: string
    readonly url: string
  }
}

export type ScrapeOutcome = ScrapeResult | ScrapeError
