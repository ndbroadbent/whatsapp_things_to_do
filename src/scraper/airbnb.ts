/**
 * Airbnb Scraper
 *
 * Extract metadata from Airbnb listing URLs.
 *
 * Airbnb uses OG tags for listing metadata.
 * Note: Airbnb redirects based on geo, so we follow redirects.
 */

import { guardedFetch } from '../http.js'
import type { FetchFn, ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types.js'
import {
  createHtmlFetchHeaders,
  DEFAULT_USER_AGENT,
  extractHashtags,
  extractOpenGraph,
  type FullResponse,
  handleHttpError,
  networkError,
  wrapParseResult
} from './utils.js'

/**
 * Extract listing ID from an Airbnb URL.
 * Handles rooms, homes, and experiences URLs.
 */
export function extractAirbnbListingId(url: string): string | null {
  // Room URL: airbnb.com/rooms/12345678
  const roomMatch = url.match(/airbnb\.[^/]+\/rooms\/(\d+)/)
  if (roomMatch?.[1]) return roomMatch[1]

  // Home URL: airbnb.com/h/unique-home-name
  const hMatch = url.match(/airbnb\.[^/]+\/h\/([^/?]+)/)
  if (hMatch?.[1]) return hMatch[1]

  // Experience URL: airbnb.com/experiences/12345678
  const expMatch = url.match(/airbnb\.[^/]+\/experiences\/(\d+)/)
  if (expMatch?.[1]) return `exp-${expMatch[1]}`

  return null
}

/**
 * Parse Airbnb OG tags into ScrapedMetadata.
 */
function parseAirbnbData(
  og: Record<string, string>,
  canonicalUrl: string,
  listingId: string | null
): ScrapedMetadata | null {
  const title = og.title ?? null
  const description = og.description ?? null
  const thumbnailUrl = og.image ?? null

  // Extract hashtags from description if present
  const hashtags = description ? extractHashtags(description) : []

  if (!title && !description) return null

  return {
    platform: 'airbnb',
    canonicalUrl,
    contentId: listingId,
    title,
    description,
    hashtags,
    creator: null,
    thumbnailUrl,
    categories: [],
    suggestedKeywords: [],
    rawData: { og }
  }
}

/**
 * Scrape metadata from an Airbnb URL.
 */
export async function scrapeAirbnb(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  try {
    // Extract listing ID from URL
    const listingId = extractAirbnbListingId(url)
    if (!listingId) {
      return {
        ok: false,
        error: { type: 'parse', message: 'Could not extract listing ID from URL', url }
      }
    }

    // Fetch the HTML page (follows redirects by default)
    const rawResponse = await fetchFn(url, {
      signal: AbortSignal.timeout(timeout),
      headers: createHtmlFetchHeaders(userAgent)
    })
    const response = rawResponse as unknown as FullResponse

    const httpError = handleHttpError(response, url, 'Airbnb', 'Listing not found')
    if (httpError) return httpError

    const html = await response.text()

    // Extract OG tags
    const og = extractOpenGraph(html)

    const metadata = parseAirbnbData(og, url, listingId)
    return wrapParseResult(metadata, url)
  } catch (error) {
    return networkError(error, url)
  }
}
