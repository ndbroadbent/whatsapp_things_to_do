/**
 * Generic Website Scraper
 *
 * Scrape OG tags and JSON-LD from any URL.
 * Used as fallback when no platform-specific scraper exists.
 *
 * Security:
 * - Blocks requests to our own domains
 * - Validates URLs to prevent path traversal
 *
 * Redirect handling:
 * - Manually follows up to 10 redirects
 * - Captures final URL even if destination fails (valuable for shortened URLs)
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
  findJsonLdByType,
  wrapParseResult
} from './utils'

/** Response interface for manual redirect handling */
interface RedirectResponse {
  url: string
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  text(): Promise<string>
}

/** Domains we refuse to scrape (our own infrastructure) */
const BLOCKED_DOMAINS = ['chattomap.com', 'docspring.com']

/** Max redirects to follow */
const MAX_REDIRECTS = 10

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
 * Follow redirects manually to capture final URL even if destination fails.
 * Returns { finalUrl, response } or { finalUrl, error }.
 */
async function followRedirects(
  url: string,
  fetchFn: FetchFn,
  headers: Record<string, string>,
  timeout: number
): Promise<
  | { finalUrl: string; response: RedirectResponse; error?: undefined }
  | { finalUrl: string; error: string }
> {
  let currentUrl = url
  let redirectCount = 0

  while (redirectCount < MAX_REDIRECTS) {
    try {
      const rawResponse = await fetchFn(currentUrl, {
        signal: AbortSignal.timeout(timeout),
        headers,
        redirect: 'manual' // Don't auto-follow - we handle it
      })
      const response = rawResponse as unknown as RedirectResponse

      // Check for redirect status codes
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) {
          // Redirect without location - treat as error
          return {
            finalUrl: currentUrl,
            error: `Redirect ${response.status} without Location header`
          }
        }
        // Resolve relative URLs
        currentUrl = new URL(location, currentUrl).href
        redirectCount++
        continue
      }

      // Not a redirect - return the response
      return { finalUrl: currentUrl, response }
    } catch (e) {
      // Network error trying to reach currentUrl
      const message = e instanceof Error ? e.message : String(e)
      return { finalUrl: currentUrl, error: message }
    }
  }

  return { finalUrl: currentUrl, error: 'Too many redirects' }
}

/**
 * Scrape metadata from any URL using OG tags and JSON-LD.
 * Manually follows redirects to capture final URL even if destination fails.
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

  const headers = createHtmlFetchHeaders(userAgent)
  const result = await followRedirects(url, fetchFn, headers, timeout)

  // Determine finalUrl for error responses (only if different from original)
  const finalUrl = result.finalUrl !== url ? result.finalUrl : undefined

  // Network error during redirect chain
  if ('error' in result && result.error) {
    return {
      ok: false,
      error: finalUrl
        ? { type: 'network', message: result.error, url, finalUrl }
        : { type: 'network', message: result.error, url }
    }
  }

  // Type narrowing: if we get here, result has 'response'
  const response = (result as { finalUrl: string; response: RedirectResponse }).response

  // Handle HTTP errors
  if (!response.ok) {
    const status = response.status
    if (status === 404) {
      return {
        ok: false,
        error: finalUrl
          ? { type: 'not_found', message: 'Page not found', url, finalUrl }
          : { type: 'not_found', message: 'Page not found', url }
      }
    }
    if (status === 403 || status === 429) {
      return {
        ok: false,
        error: finalUrl
          ? { type: 'blocked', message: `Blocked (${status})`, url, finalUrl }
          : { type: 'blocked', message: `Blocked (${status})`, url }
      }
    }
    return {
      ok: false,
      error: finalUrl
        ? { type: 'network', message: `HTTP ${status}`, url, finalUrl }
        : { type: 'network', message: `HTTP ${status}`, url }
    }
  }

  const html = await response.text()

  // Extract embedded data
  const jsonLd = extractJsonLd(html)
  const og = extractOpenGraph(html)

  const metadata = parseGenericData(jsonLd, og, result.finalUrl)
  return wrapParseResult(metadata, url)
}
