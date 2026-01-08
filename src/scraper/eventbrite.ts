/**
 * Eventbrite Scraper
 *
 * Extract metadata from Eventbrite event URLs.
 *
 * Eventbrite embeds structured data in their HTML pages including:
 * - JSON-LD structured data (Event)
 * - Open Graph meta tags for fallback
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
  getNestedValue,
  handleHttpError,
  networkError,
  wrapParseResult
} from './utils'

/**
 * Extract event ID from an Eventbrite URL.
 * Handles various Eventbrite URL formats.
 */
export function extractEventbriteId(url: string): string | null {
  // Event ticket URL: -12345678901?
  const ticketsMatch = url.match(/-(\d{9,})(?:\?|$)/)
  if (ticketsMatch?.[1]) return ticketsMatch[1]

  // Direct event URL: /e/12345678901
  const directMatch = url.match(/\/e\/(\d{9,})/)
  if (directMatch?.[1]) return directMatch[1]

  return null
}

/**
 * Extract location info from event data.
 */
function extractEventLocation(location: unknown): string[] {
  if (!location || typeof location !== 'object') return []
  const loc = location as Record<string, unknown>
  const categories: string[] = []

  if (loc.name) categories.push(loc.name as string)

  if (loc.address && typeof loc.address === 'object') {
    const addr = loc.address as Record<string, unknown>
    const parts = [addr.addressLocality, addr.addressRegion].filter(Boolean)
    if (parts.length > 0) categories.push(parts.join(', '))
  }

  return categories
}

/**
 * Format event date for display.
 */
function formatEventDate(dateStr: string): string | null {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

/**
 * Parse Eventbrite data into ScrapedMetadata.
 */
function parseEventbriteData(
  jsonLd: unknown[],
  og: Record<string, string>,
  canonicalUrl: string,
  eventId: string | null
): ScrapedMetadata | null {
  const data = findJsonLdByType(jsonLd, ['Event'])

  const title = (data?.name as string) ?? og.title ?? null
  const description = (data?.description as string) ?? og.description ?? null
  const imageUrl = extractImageUrl(data?.image) ?? og.image ?? null

  // Extract hashtags from description
  const hashtags = description ? extractHashtags(description) : []

  // Extract creator/organizer
  let creator: string | null = null
  if (data?.organizer && typeof data.organizer === 'object') {
    creator = (getNestedValue(data.organizer, ['name']) as string) ?? null
  }

  // Build categories
  const categories: string[] = ['event']
  categories.push(...extractEventLocation(data?.location))

  // Add formatted date
  if (data?.startDate) {
    const formattedDate = formatEventDate(data.startDate as string)
    if (formattedDate) categories.push(formattedDate)
  }

  if (!title && !description) return null

  return {
    canonicalUrl,
    contentId: eventId,
    title,
    description,
    hashtags,
    creator,
    imageUrl,
    categories,
    suggestedKeywords: [],
    rawData: { jsonLd, og }
  }
}

/**
 * Scrape metadata from an Eventbrite URL.
 */
export async function scrapeEventbrite(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  try {
    // Extract event ID from URL
    const eventId = extractEventbriteId(url)
    if (!eventId) {
      return {
        ok: false,
        error: {
          type: 'parse',
          message: 'Could not extract event ID from URL',
          url
        }
      }
    }

    // Fetch the HTML page
    const rawResponse = await fetchFn(url, {
      signal: AbortSignal.timeout(timeout),
      headers: createHtmlFetchHeaders(userAgent)
    })
    const response = rawResponse as unknown as FullResponse

    const httpError = handleHttpError(response, url, 'Eventbrite', 'Event not found')
    if (httpError) return httpError

    const html = await response.text()

    // Extract embedded data
    const jsonLd = extractJsonLd(html)
    const og = extractOpenGraph(html)

    const metadata = parseEventbriteData(jsonLd, og, url, eventId)
    return wrapParseResult(metadata, url)
  } catch (error) {
    return networkError(error, url)
  }
}
