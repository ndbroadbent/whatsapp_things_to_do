/**
 * URL Metadata Fetching
 *
 * Scrape URLs to extract metadata: title, description, OpenGraph images,
 * JSON-LD structured data, creator info, categories, etc.
 * Results are cached to avoid re-fetching.
 *
 * Features:
 * - Parallel scraping (default 5 concurrent)
 * - Hard timeout per URL (default 4s)
 * - Caching via ResponseCache interface
 */

import { decode } from 'html-entities'
import { generateUrlCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import type { CandidateMessage } from '../types'
import { scrapeUrl } from './index'
import type { ScrapedMetadata, ScraperConfig } from './types'

/**
 * Decode HTML entities in scraped metadata text fields.
 */
function decodeMetadata(metadata: ScrapedMetadata): ScrapedMetadata {
  return {
    ...metadata,
    title: metadata.title ? decode(metadata.title) : null,
    description: metadata.description ? decode(metadata.description) : null,
    creator: metadata.creator ? decode(metadata.creator) : null
  }
}

const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_CONCURRENCY = 5

/** URL regex - matches http/https URLs */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

/**
 * Extract all unique URLs from text.
 */
export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_REGEX) ?? []
  return [...new Set(matches)]
}

/**
 * Extract all unique URLs from an array of candidates.
 * Looks in the candidate content and surrounding context.
 */
export function extractUrlsFromCandidates(candidates: readonly CandidateMessage[]): string[] {
  const urls = new Set<string>()
  for (const candidate of candidates) {
    // Check the target message content
    for (const url of extractUrlsFromText(candidate.content)) {
      urls.add(url)
    }
    // Check context before
    for (const msg of candidate.contextBefore) {
      for (const url of extractUrlsFromText(msg.content)) {
        urls.add(url)
      }
    }
    // Check context after
    for (const msg of candidate.contextAfter) {
      for (const url of extractUrlsFromText(msg.content)) {
        urls.add(url)
      }
    }
  }
  return [...urls]
}

interface FetchOptions extends ScraperConfig {
  /** Callback when scraping starts (only called if there are uncached URLs) */
  onScrapeStart?: ((info: { urlCount: number; cachedCount: number }) => void) | undefined
  /** Callback for each URL scraped (always called - success or failure) */
  onUrlScraped?:
    | ((info: {
        url: string
        success: boolean
        error?: string | undefined
        current: number
        total: number
      }) => void)
    | undefined
  /** Callback for debug logging */
  onDebug?: ((message: string) => void) | undefined
  /** Max concurrent scrapes (default 5) */
  concurrency?: number | undefined
  /** Cache for scrape results */
  cache?: ResponseCache | undefined
}

/** Cache TTL for scraped metadata (24 hours - URLs don't change often) */

/** Cache TTL for scrape errors (1 hour - don't hammer failing URLs) */

/** Marker for cached errors */
interface CachedError {
  error: true
  message: string
}

type CachedScrapeResult = ScrapedMetadata | CachedError

function isCachedError(data: CachedScrapeResult): data is CachedError {
  return 'error' in data && data.error === true
}

/**
 * Scrape a single URL with timeout and caching.
 * Caches both successes and failures.
 */
async function scrapeWithCache(
  url: string,
  options: FetchOptions
): Promise<{
  url: string
  metadata: ScrapedMetadata | null
  error?: string | undefined
}> {
  const cache = options.cache
  const cacheKey = generateUrlCacheKey(url)

  // Check cache first (already handled in fetchMetadataForUrls)
  // This function is only called for uncached URLs

  // Scrape with timeout
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS
  try {
    const result = await scrapeUrl(url, { ...options, timeout: timeoutMs })

    if (result.ok) {
      // Decode HTML entities and cache result
      const decoded = decodeMetadata(result.metadata)
      if (cache) {
        await cache.set(cacheKey, { data: decoded, cachedAt: Date.now() })
      }
      return { url, metadata: decoded }
    }

    // Scrape failed - but if we got a finalUrl from redirect, create minimal metadata
    // This preserves valuable URL path info (slugs, IDs) from shortened URLs
    const errorMsg = result.error?.message ?? 'Unknown error'
    const finalUrl = result.error?.finalUrl

    if (finalUrl) {
      // Create minimal metadata with just the redirect URL
      const minimalMetadata: ScrapedMetadata = {
        canonicalUrl: finalUrl,
        contentId: null,
        title: null,
        description: null,
        hashtags: [],
        creator: null,
        imageUrl: null,
        categories: [],
        suggestedKeywords: []
      }
      if (cache) {
        await cache.set(cacheKey, {
          data: minimalMetadata,
          cachedAt: Date.now()
        })
      }
      return { url, metadata: minimalMetadata, error: errorMsg }
    }

    // No finalUrl - just cache the error
    if (cache) {
      await cache.set(cacheKey, {
        data: { error: true, message: errorMsg } as CachedError,
        cachedAt: Date.now()
      })
    }
    return { url, metadata: null, error: errorMsg }
  } catch (e) {
    // Timeout or other error
    const errorMsg = e instanceof Error ? e.message : 'Timeout'
    if (cache) {
      await cache.set(cacheKey, {
        data: { error: true, message: errorMsg } as CachedError,
        cachedAt: Date.now()
      })
    }
    return { url, metadata: null, error: errorMsg }
  }
}

/**
 * Fetch metadata for a list of URLs.
 * Best-effort: failures are silently skipped.
 * Uses parallel scraping with configurable concurrency.
 * Caches both successes and failures to avoid re-fetching.
 */
export async function fetchMetadataForUrls(
  urls: readonly string[],
  options: FetchOptions = {}
): Promise<Map<string, ScrapedMetadata>> {
  if (urls.length === 0) {
    return new Map()
  }

  const metadataMap = new Map<string, ScrapedMetadata>()
  const cache = options.cache

  // Check cache first to separate cached vs uncached URLs
  const uncachedUrls: string[] = []
  if (cache) {
    for (const url of urls) {
      const cacheKey = generateUrlCacheKey(url)
      const cached = await cache.get<CachedScrapeResult>(cacheKey)
      if (cached) {
        if (isCachedError(cached.data)) {
          options.onDebug?.(`Cache HIT (error): ${url} -> ${cached.data.message}`)
          // Don't add to metadataMap - it's a cached error
        } else {
          options.onDebug?.(`Cache HIT: ${url} -> ${cacheKey}`)
          metadataMap.set(url, cached.data)
        }
      } else {
        options.onDebug?.(`Cache MISS: ${url} -> ${cacheKey}`)
        uncachedUrls.push(url)
      }
    }
  } else {
    uncachedUrls.push(...urls)
  }

  // Only call onScrapeStart if there are uncached URLs to fetch
  if (uncachedUrls.length > 0) {
    options.onScrapeStart?.({
      urlCount: uncachedUrls.length,
      cachedCount: urls.length - uncachedUrls.length
    })
  }

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  let completed = 0

  // Process only uncached URLs in parallel batches
  for (let i = 0; i < uncachedUrls.length; i += concurrency) {
    const batch = uncachedUrls.slice(i, i + concurrency)
    const results = await Promise.all(batch.map((url) => scrapeWithCache(url, options)))

    for (const { url, metadata, error } of results) {
      completed++
      const success = metadata !== null
      if (metadata) {
        metadataMap.set(url, metadata)
      }
      options.onUrlScraped?.({
        url,
        success,
        error,
        current: completed,
        total: uncachedUrls.length
      })
    }
  }

  return metadataMap
}
