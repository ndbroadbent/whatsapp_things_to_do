/**
 * Generic Website Scraper
 *
 * Scrape OG tags and JSON-LD from any URL.
 * Used as fallback when no platform-specific scraper exists.
 *
 * Security:
 * - Blocks requests to our own domains
 * - Validates URLs to prevent path traversal
 * - Follows max 3 redirects
 */

import { guardedFetch } from '../http'
import type { FetchFn, ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types'
import {
  createHtmlFetchHeaders,
  DEFAULT_USER_AGENT,
  extractHashtags,
  extractImageUrl,
  extractJsonLd,
  extractOpenGraph,
  type FullResponse,
  findJsonLdByType,
  networkError,
  wrapParseResult
} from './utils'

/** Domains we refuse to scrape (our own infrastructure) */
const BLOCKED_DOMAINS = ['chattomap.com', 'docspring.com']

/**
 * Validate URL for security issues.
 * Returns error message if invalid, null if OK.
 */
function validateUrl(url: string): string | null {
  try {
    const parsed = new URL(url)

    // Must be http or https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return `Invalid protocol: ${parsed.protocol}`
    }

    // Block our own domains
    const hostname = parsed.hostname.toLowerCase()
    for (const blocked of BLOCKED_DOMAINS) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        return `Blocked domain: ${hostname}`
      }
    }

    // Check for path traversal
    if (parsed.pathname.includes('..') || parsed.pathname.includes('//')) {
      return 'Suspicious path detected'
    }

    return null
  } catch {
    return 'Invalid URL'
  }
}

/**
 * Extract domain from URL for display.
 */
function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * Parse generic website data into ScrapedMetadata.
 */
function parseGenericData(
  jsonLd: unknown[],
  og: Record<string, string>,
  canonicalUrl: string
): ScrapedMetadata | null {
  // Try common JSON-LD types
  const data = findJsonLdByType(jsonLd, [
    'Article',
    'NewsArticle',
    'BlogPosting',
    'WebPage',
    'Product',
    'Place',
    'LocalBusiness',
    'Restaurant',
    'Event',
    'Organization'
  ])

  const title = (data?.name as string) ?? (data?.headline as string) ?? og.title ?? null
  const description = (data?.description as string) ?? og.description ?? null
  const thumbnailUrl = extractImageUrl(data?.image) ?? og.image ?? null

  // Extract hashtags from description
  const hashtags = description ? extractHashtags(description) : []

  // Build categories from JSON-LD type
  const categories: string[] = []
  const domain = extractDomain(canonicalUrl)
  if (domain) categories.push(domain)
  if (data?.['@type'] && typeof data['@type'] === 'string') {
    categories.push(data['@type'].toLowerCase())
  }

  if (!title && !description) return null

  return {
    canonicalUrl,
    contentId: null,
    title,
    description,
    hashtags,
    creator: null,
    thumbnailUrl,
    categories,
    suggestedKeywords: [],
    rawData: { jsonLd, og }
  }
}

/**
 * Scrape metadata from any URL using OG tags and JSON-LD.
 * Follows up to 3 redirects.
 */
export async function scrapeGeneric(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  // Validate URL
  const validationError = validateUrl(url)
  if (validationError) {
    return {
      ok: false,
      error: { type: 'parse', message: validationError, url }
    }
  }

  try {
    // Fetch follows redirects automatically (up to browser limit ~20)
    const rawResponse = await fetchFn(url, {
      signal: AbortSignal.timeout(timeout),
      headers: createHtmlFetchHeaders(userAgent)
    })
    const response = rawResponse as unknown as FullResponse

    // Handle errors
    if (!response.ok) {
      const status = response.status
      if (status === 404) {
        return { ok: false, error: { type: 'not_found', message: 'Page not found', url } }
      }
      if (status === 403 || status === 429) {
        return {
          ok: false,
          error: { type: 'blocked', message: `Blocked (${status})`, url }
        }
      }
      return { ok: false, error: { type: 'network', message: `HTTP ${status}`, url } }
    }

    const html = await response.text()

    // Extract embedded data
    const jsonLd = extractJsonLd(html)
    const og = extractOpenGraph(html)

    const metadata = parseGenericData(jsonLd, og, url)
    return wrapParseResult(metadata, url)
  } catch (error) {
    return networkError(error, url)
  }
}
