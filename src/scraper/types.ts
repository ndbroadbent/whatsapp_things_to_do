/**
 * Scraper Types
 *
 * Types for URL metadata scraping.
 */

/**
 * Minimal response interface that both standard Response and Bun's Response satisfy.
 * Avoids Bun's BunResponseOverride type conflicts.
 */
interface FetchResponse {
  readonly ok: boolean
  readonly status: number
  readonly headers: { get(name: string): string | null }
  text(): Promise<string>
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * Fetch function type for dependency injection.
 * Uses explicit interface to avoid Bun type conflicts.
 */
export type FetchFn = (url: string, init?: RequestInit) => Promise<FetchResponse>

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
 * Metadata scraped from a URL.
 */
export interface ScrapedMetadata {
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
  /** Image URL from OG tags or JSON-LD */
  readonly imageUrl: string | null
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
interface ScrapeResult {
  readonly ok: true
  readonly metadata: ScrapedMetadata
}

/**
 * Error from a scrape attempt.
 */
interface ScrapeError {
  readonly ok: false
  readonly error: {
    readonly type: 'network' | 'parse' | 'blocked' | 'not_found' | 'unsupported'
    readonly message: string
    readonly url: string
    /** Final URL after redirects (if different from url). Valuable for shortened URLs. */
    readonly finalUrl?: string
  }
}

export type ScrapeOutcome = ScrapeResult | ScrapeError
