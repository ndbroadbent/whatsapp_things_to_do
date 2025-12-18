/**
 * Shared utilities for social media scrapers.
 */

import type { ScrapedMetadata, ScrapeOutcome } from './types.js'

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
 * Wrap a metadata parsing result with standard error handling.
 */
export function wrapParseResult(metadata: ScrapedMetadata | null, url: string): ScrapeOutcome {
  if (!metadata) {
    return {
      ok: false,
      error: { type: 'parse', message: 'Could not parse video data', url }
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
