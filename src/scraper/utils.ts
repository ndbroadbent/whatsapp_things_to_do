/**
 * Shared utilities for social media scrapers.
 */

import type { ScrapedMetadata, ScrapeOutcome } from './types'

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Response interface for Bun type workaround.
 * Includes `url` to capture the final URL after redirects.
 */
export interface FullResponse {
  url: string
  ok: boolean
  status: number
  text(): Promise<string>
}

/**
 * Navigate nested object safely.
 */
export function getNestedValue(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/**
 * Extract hashtags from text.
 * Returns lowercase hashtags without the # prefix.
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u00C0-\u024F]+/g)
  return matches ? matches.map((tag) => tag.slice(1).toLowerCase()) : []
}

/**
 * Extract JSON-LD structured data from HTML.
 */
export function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = []
  const matches = html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([^<]+)<\/script>/gi)

  for (const match of matches) {
    if (match[1]) {
      try {
        results.push(JSON.parse(match[1]))
      } catch {
        // Skip invalid JSON
      }
    }
  }
  return results
}

/**
 * Extract Open Graph meta tags from HTML.
 */
export function extractOpenGraph(html: string): Record<string, string> {
  const og: Record<string, string> = {}

  // property="og:X" content="Y"
  for (const match of html.matchAll(
    /<meta[^>]*property="og:([^"]+)"[^>]*content="([^"]*)"[^>]*>/gi
  )) {
    if (match[1] && match[2]) og[match[1]] = match[2]
  }
  // content="Y" property="og:X"
  for (const match of html.matchAll(
    /<meta[^>]*content="([^"]*)"[^>]*property="og:([^"]+)"[^>]*>/gi
  )) {
    if (match[1] && match[2]) og[match[2]] = match[1]
  }

  return og
}

/**
 * Find JSON-LD data matching specific schema types.
 */
export function findJsonLdByType(
  jsonLd: unknown[],
  types: string[]
): Record<string, unknown> | null {
  for (const data of jsonLd) {
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      if (typeof d['@type'] === 'string' && types.includes(d['@type'])) {
        return d
      }
    }
  }
  return null
}

/**
 * Extract image URL from various formats.
 */
export function extractImageUrl(image: unknown): string | null {
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return image[0] as string
  if (typeof image === 'object' && image !== null) {
    return (getNestedValue(image, ['url']) as string) ?? null
  }
  return null
}

/**
 * Wrap a metadata parsing result with standard error handling.
 */
export function wrapParseResult(metadata: ScrapedMetadata | null, url: string): ScrapeOutcome {
  if (!metadata) {
    return {
      ok: false,
      error: { type: 'parse', message: 'Could not parse data', url }
    }
  }
  return { ok: true, metadata }
}

/**
 * Create a network error outcome from a caught exception.
 */
export function networkError(error: unknown, url: string): ScrapeOutcome {
  const message = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    error: { type: 'network', message, url }
  }
}

/**
 * Create standard HTML fetch headers.
 */
export function createHtmlFetchHeaders(userAgent: string): Record<string, string> {
  return {
    'User-Agent': userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache'
  }
}

/**
 * Handle HTTP errors from fetch responses.
 * Returns null if response is OK, otherwise returns an error outcome.
 */
export function handleHttpError(
  response: FullResponse,
  url: string,
  platformName: string,
  notFoundMessage: string
): ScrapeOutcome | null {
  if (response.ok) return null

  if (response.status === 404) {
    return { ok: false, error: { type: 'not_found', message: notFoundMessage, url } }
  }
  if (response.status === 403 || response.status === 429) {
    return {
      ok: false,
      error: { type: 'blocked', message: `Blocked by ${platformName} (${response.status})`, url }
    }
  }
  return { ok: false, error: { type: 'network', message: `HTTP ${response.status}`, url } }
}
