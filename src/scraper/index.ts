/**
 * URL Scraper
 *
 * Extract metadata from any URL using OG tags and JSON-LD.
 *
 * Architecture:
 * - Blocklist: booking.com, tripadvisor (block automated requests)
 * - Specific scrapers: YouTube, TikTok, Eventbrite, Airbnb
 * - Generic scraper: Everything else (OG tags + JSON-LD)
 */

import type { SocialPlatform } from '../types'
import { scrapeAirbnb } from './airbnb'
import { scrapeEventbrite } from './eventbrite'
import { scrapeGeneric } from './generic'
import { scrapeReddit } from './reddit'
import { scrapeTikTok } from './tiktok'
import type { ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types'
import { scrapeYouTube } from './youtube'

export { extractRedditPostId, isRedditUrl, scrapeReddit } from './reddit'
export { extractTikTokVideoId, resolveTikTokUrl, scrapeTikTok } from './tiktok'
export type { ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types'
export { buildYouTubeUrl, extractYouTubeVideoId, scrapeYouTube } from './youtube'

/** Domains that block automated requests - don't even try */
const BLOCKLISTED_DOMAINS = [
  'booking.com',
  'tripadvisor.com',
  'tripadvisor.co.nz',
  'tripadvisor.co.uk'
]

/**
 * Check if URL matches a domain pattern.
 * More precise than includes() to avoid false positives like "reddit.com" matching "t.co".
 */
function matchesDomain(url: string, ...domains: string[]): boolean {
  for (const domain of domains) {
    // Match domain at start of host or as subdomain
    const patterns = [
      `://${domain}`, // Direct match: https://example.com
      `.${domain}`, // Subdomain: https://www.example.com
      `/${domain}` // Path-based (rare): http://redirect/example.com
    ]
    for (const pattern of patterns) {
      if (url.includes(pattern)) {
        return true
      }
    }
  }
  return false
}

/**
 * Detect the social platform from a URL.
 */
export function detectPlatform(url: string): SocialPlatform {
  const lower = url.toLowerCase()

  if (matchesDomain(lower, 'tiktok.com')) {
    return 'tiktok'
  }
  if (matchesDomain(lower, 'instagram.com', 'instagr.am')) {
    return 'instagram'
  }
  if (matchesDomain(lower, 'youtube.com', 'youtu.be', 'youtube-nocookie.com')) {
    return 'youtube'
  }
  if (matchesDomain(lower, 'twitter.com', 'x.com', 't.co')) {
    return 'x'
  }
  if (matchesDomain(lower, 'facebook.com', 'fb.watch', 'fb.me')) {
    return 'facebook'
  }
  if (
    matchesDomain(lower, 'maps.google.com', 'maps.app.goo.gl') ||
    lower.includes('goo.gl/maps') ||
    lower.includes('google.com/maps')
  ) {
    return 'google_maps'
  }
  if (matchesDomain(lower, 'airbnb.com', 'airbnb.co.nz', 'airbnb.co.uk')) {
    return 'airbnb'
  }
  if (matchesDomain(lower, 'booking.com')) {
    return 'booking'
  }
  if (matchesDomain(lower, 'tripadvisor.com', 'tripadvisor.co.nz', 'tripadvisor.co.uk')) {
    return 'tripadvisor'
  }
  if (matchesDomain(lower, 'eventbrite.com', 'eventbrite.co.nz', 'eventbrite.co.uk')) {
    return 'eventbrite'
  }
  if (matchesDomain(lower, 'reddit.com', 'redd.it')) {
    return 'reddit'
  }

  return 'other'
}

/**
 * Check if URL is on the blocklist.
 */
function isBlocklisted(url: string): boolean {
  const lower = url.toLowerCase()
  return BLOCKLISTED_DOMAINS.some((domain) => matchesDomain(lower, domain))
}

/**
 * Scrape metadata from any URL.
 * Uses platform-specific scrapers where available, falls back to generic.
 * Returns { ok: false } for blocklisted domains.
 */
export async function scrapeUrl(url: string, config: ScraperConfig = {}): Promise<ScrapeOutcome> {
  // Check blocklist first
  if (isBlocklisted(url)) {
    return {
      ok: false,
      error: { type: 'blocked', message: 'Domain blocks automated requests', url }
    }
  }

  const platform = detectPlatform(url)

  switch (platform) {
    case 'tiktok':
      return scrapeTikTok(url, config)

    case 'youtube':
      return scrapeYouTube(url, config)

    case 'airbnb':
      return scrapeAirbnb(url, config)

    case 'eventbrite':
      return scrapeEventbrite(url, config)

    case 'reddit':
      return scrapeReddit(url, config)

    // Google Maps URLs are handled by geocoder, not scraper
    case 'google_maps':
      return {
        ok: false,
        error: { type: 'unsupported', message: 'Google Maps handled by geocoder', url }
      }

    // All other URLs: use generic scraper (OG tags + JSON-LD)
    default:
      return scrapeGeneric(url, config)
  }
}

/**
 * Scrape metadata from multiple URLs with rate limiting.
 */
export async function scrapeUrls(
  urls: readonly string[],
  config: ScraperConfig = {}
): Promise<Map<string, ScrapeOutcome>> {
  const results = new Map<string, ScrapeOutcome>()
  const rateLimitMs = config.rateLimitMs ?? 500

  for (const url of urls) {
    const result = await scrapeUrl(url, config)
    results.set(url, result)

    // Rate limit between requests
    if (rateLimitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, rateLimitMs))
    }
  }

  return results
}

/**
 * Enrich ActivityLinks with scraped metadata.
 * Returns a map of URL -> metadata for successful scrapes.
 */
export async function scrapeActivityLinks(
  urls: readonly string[],
  config: ScraperConfig = {}
): Promise<{ successful: Map<string, ScrapedMetadata>; failed: Map<string, string> }> {
  const successful = new Map<string, ScrapedMetadata>()
  const failed = new Map<string, string>()

  const results = await scrapeUrls(urls, config)

  for (const [url, result] of results) {
    if (result.ok) {
      successful.set(url, result.metadata)
    } else {
      failed.set(url, result.error.message)
    }
  }

  return { successful, failed }
}
