/**
 * Context Enrichment with URL Metadata
 *
 * Scrape URLs found in candidate contexts and inject metadata inline.
 * Format: URL followed by JSON metadata on the next line.
 *
 * Features:
 * - Parallel scraping (default 5 concurrent)
 * - Hard timeout per URL (default 4s)
 * - Caching via ResponseCache interface
 */

import { generateUrlCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import type { CandidateMessage } from '../types'
import { scrapeUrl } from './index'
import type { ScrapedMetadata, ScraperConfig } from './types'

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
 */
export function extractUrlsFromCandidates(candidates: readonly CandidateMessage[]): string[] {
  const urls = new Set<string>()
  for (const candidate of candidates) {
    const text = candidate.context ?? candidate.content
    for (const url of extractUrlsFromText(text)) {
      urls.add(url)
    }
  }
  return [...urls]
}

/**
 * Format scraped metadata as compact JSON for injection.
 * Only includes non-null fields to minimize prompt tokens.
 */
function formatMetadataJson(metadata: ScrapedMetadata): string {
  const obj: Record<string, unknown> = {
    platform: metadata.platform
  }
  if (metadata.title) obj.title = metadata.title
  if (metadata.description) obj.description = metadata.description.slice(0, 200)
  if (metadata.creator) obj.creator = metadata.creator
  if (metadata.categories?.length) obj.categories = metadata.categories
  return JSON.stringify(obj)
}

/**
 * Inject metadata JSON after each URL in text.
 * Returns the enriched text with metadata on lines after URLs.
 */
export function injectMetadataIntoText(
  text: string,
  metadataMap: Map<string, ScrapedMetadata>
): string {
  // Find all URLs and their positions
  const urlMatches = [...text.matchAll(URL_REGEX)]
  if (urlMatches.length === 0) return text

  // Build result by processing URLs in reverse order (to preserve positions)
  let result = text
  for (let i = urlMatches.length - 1; i >= 0; i--) {
    const match = urlMatches[i]
    if (!match || match.index === undefined) continue

    const url = match[0]
    const metadata = metadataMap.get(url)
    if (!metadata) continue

    const insertPos = match.index + url.length
    const json = formatMetadataJson(metadata)
    result = `${result.slice(0, insertPos)}\n[URL_META: ${json}]${result.slice(insertPos)}`
  }

  return result
}

/**
 * Enrich candidate contexts with scraped URL metadata.
 * Modifies the context field to include metadata JSON after each URL.
 */
export function enrichCandidatesWithMetadata(
  candidates: readonly CandidateMessage[],
  metadataMap: Map<string, ScrapedMetadata>
): CandidateMessage[] {
  return candidates.map((candidate) => {
    const context = candidate.context ?? `>>> ${candidate.sender}: ${candidate.content}`
    const enrichedContext = injectMetadataIntoText(context, metadataMap)
    return {
      ...candidate,
      context: enrichedContext
    }
  })
}

export interface EnrichOptions extends ScraperConfig {
  /** Callback when scraping starts */
  onScrapeStart?: (info: { urlCount: number }) => void
  /** Callback for each URL scraped */
  onUrlScraped?: (info: { url: string; success: boolean; current: number; total: number }) => void
  /** Max concurrent scrapes (default 5) */
  concurrency?: number
  /** Cache for scrape results */
  cache?: ResponseCache
}

/** Cache TTL for scraped metadata (24 hours - URLs don't change often) */
const SCRAPE_CACHE_TTL_SECONDS = 24 * 60 * 60

/**
 * Scrape a single URL with timeout and caching.
 */
async function scrapeWithCache(
  url: string,
  options: EnrichOptions
): Promise<{ url: string; metadata: ScrapedMetadata | null }> {
  const cache = options.cache
  const cacheKey = generateUrlCacheKey(url)

  // Check cache first
  if (cache) {
    const cached = await cache.get<ScrapedMetadata>(cacheKey)
    if (cached) {
      return { url, metadata: cached.data }
    }
  }

  // Scrape with timeout
  const timeoutMs = options.timeout ?? DEFAULT_TIMEOUT_MS
  try {
    const result = await scrapeUrl(url, { ...options, timeout: timeoutMs })

    if (result.ok) {
      // Cache successful result
      if (cache) {
        await cache.set(
          cacheKey,
          { data: result.metadata, cachedAt: Date.now() },
          SCRAPE_CACHE_TTL_SECONDS
        )
      }
      return { url, metadata: result.metadata }
    }
  } catch {
    // Timeout or other error - silently skip
  }

  return { url, metadata: null }
}

/**
 * Scrape all URLs found in candidates and return enriched candidates.
 * Best-effort: failures are silently skipped (no metadata injected).
 * Uses parallel scraping with configurable concurrency.
 */
export async function scrapeAndEnrichCandidates(
  candidates: readonly CandidateMessage[],
  options: EnrichOptions = {}
): Promise<CandidateMessage[]> {
  const urls = extractUrlsFromCandidates(candidates)

  if (urls.length === 0) {
    return [...candidates]
  }

  options.onScrapeStart?.({ urlCount: urls.length })

  const metadataMap = new Map<string, ScrapedMetadata>()
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  let completed = 0

  // Process URLs in parallel batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const results = await Promise.all(batch.map((url) => scrapeWithCache(url, options)))

    for (const { url, metadata } of results) {
      completed++
      const success = metadata !== null
      if (metadata) {
        metadataMap.set(url, metadata)
      }
      options.onUrlScraped?.({ url, success, current: completed, total: urls.length })
    }
  }

  return enrichCandidatesWithMetadata(candidates, metadataMap)
}
