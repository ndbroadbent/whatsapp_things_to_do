/**
 * Spotify Scraper
 *
 * Uses Spotify's oEmbed API to get metadata.
 * Spotify's web player doesn't render og tags in HTML (it's a JS SPA),
 * so we must use their oEmbed endpoint instead.
 */

import { guardedFetch } from '../http'
import type { FetchFn, ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types'
import { networkError, wrapParseResult } from './utils'

const OEMBED_ENDPOINT = 'https://open.spotify.com/oembed'

/** Response from Spotify oEmbed API */
interface SpotifyOEmbedResponse {
  title: string
  thumbnail_url: string
  thumbnail_width: number
  thumbnail_height: number
  provider_name: string
  provider_url: string
  type: string
  html: string
  width: number
  height: number
}

/**
 * Extract Spotify content type and ID from URL.
 */
export function parseSpotifyUrl(url: string): { type: string; id: string } | null {
  // Patterns:
  // https://open.spotify.com/album/1Mo4aZ8pdj6L1jx8zSwJnt
  // https://open.spotify.com/track/xxx
  // https://open.spotify.com/artist/xxx
  // https://open.spotify.com/show/xxx (podcasts)
  // https://open.spotify.com/episode/xxx
  const match = url.match(
    /open\.spotify\.com\/(album|track|artist|show|episode|playlist)\/([a-zA-Z0-9]+)/
  )
  if (match?.[1] && match?.[2]) {
    return { type: match[1], id: match[2] }
  }
  return null
}

/**
 * Scrape metadata from a Spotify URL using oEmbed API.
 */
export async function scrapeSpotify(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  const parsed = parseSpotifyUrl(url)
  if (!parsed) {
    return {
      ok: false,
      error: { type: 'parse', message: 'Invalid Spotify URL', url }
    }
  }

  try {
    const oembedUrl = `${OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}`
    const response = await fetchFn(oembedUrl, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          error: { type: 'not_found', message: 'Content not found', url }
        }
      }
      return {
        ok: false,
        error: { type: 'network', message: `HTTP ${response.status}`, url }
      }
    }

    const data = (await response.json()) as SpotifyOEmbedResponse

    const metadata: ScrapedMetadata = {
      canonicalUrl: url,
      contentId: parsed.id,
      title: data.title,
      description: null, // oEmbed doesn't include description
      hashtags: [],
      creator: null, // Would need full API for artist info
      imageUrl: data.thumbnail_url,
      categories: [parsed.type, 'spotify'],
      suggestedKeywords: [],
      rawData: data
    }

    return wrapParseResult(metadata, url)
  } catch (error) {
    return networkError(error, url)
  }
}
