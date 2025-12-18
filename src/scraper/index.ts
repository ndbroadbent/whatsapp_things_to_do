/**
 * Social Media Scraper
 *
 * Extract metadata from social media URLs.
 * Supports TikTok, Instagram, YouTube, and other platforms.
 */

import type { SocialPlatform } from '../types.js'
import { scrapeTikTok } from './tiktok.js'
import type { ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types.js'
import { scrapeYouTube } from './youtube.js'

export { extractTikTokVideoId, resolveTikTokUrl, scrapeTikTok } from './tiktok.js'
export type { ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types.js'
export { buildYouTubeUrl, extractYouTubeVideoId, scrapeYouTube } from './youtube.js'

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

  return 'other'
}

/**
 * Scrape metadata from a social media URL.
 * Automatically detects the platform and uses the appropriate scraper.
 */
export async function scrapeUrl(url: string, config: ScraperConfig = {}): Promise<ScrapeOutcome> {
  const platform = detectPlatform(url)

  switch (platform) {
    case 'tiktok':
      return scrapeTikTok(url, config)

    case 'instagram':
      // Instagram scraping is unreliable - return unsupported for now
      return {
        ok: false,
        error: {
          type: 'unsupported',
          message: 'Instagram scraping not yet implemented',
          url
        }
      }

    case 'youtube':
      return scrapeYouTube(url, config)

    case 'x':
      // X requires authentication for most content
      return {
        ok: false,
        error: {
          type: 'unsupported',
          message: 'X/Twitter scraping not yet implemented',
          url
        }
      }

    case 'facebook':
      // Facebook is heavily gated
      return {
        ok: false,
        error: {
          type: 'unsupported',
          message: 'Facebook scraping not yet implemented',
          url
        }
      }

    case 'google_maps':
      // Google Maps URLs can be parsed directly for coordinates
      return {
        ok: false,
        error: {
          type: 'unsupported',
          message: 'Google Maps URLs are handled by the geocoder, not scraper',
          url
        }
      }

    default:
      return {
        ok: false,
        error: {
          type: 'unsupported',
          message: `Unsupported platform: ${platform}`,
          url
        }
      }
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
