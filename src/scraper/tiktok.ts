/**
 * TikTok Scraper
 *
 * Extract metadata from TikTok video URLs.
 *
 * TikTok embeds rich JSON data in their HTML pages including:
 * - Video description and hashtags
 * - Creator info
 * - Categories and suggested keywords
 *
 * Short URLs (vt.tiktok.com) redirect to full URLs with video IDs.
 */

import { guardedFetch } from '../http.js'
import type { FetchFn, ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types.js'
import { extractHashtags, getNestedValue, networkError, wrapParseResult } from './utils.js'

/**
 * Minimal response interface for redirect handling.
 * Uses type assertion to work around Bun's Response type conflicts.
 */
interface RedirectResponse {
  status: number
  headers: { get(name: string): string | null }
}

/**
 * Full response interface for content fetching.
 * Uses type assertion to work around Bun's Response type conflicts.
 */
interface FullResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Extract video ID from a TikTok URL.
 * Handles both short URLs and full URLs.
 */
export function extractTikTokVideoId(url: string): string | null {
  // Full URL format: tiktok.com/@user/video/1234567890
  const videoMatch = url.match(/\/video\/(\d+)/)
  if (videoMatch?.[1]) {
    return videoMatch[1]
  }

  // Also check for /v/ format
  const vMatch = url.match(/\/v\/(\d+)/)
  if (vMatch?.[1]) {
    return vMatch[1]
  }

  return null
}

/**
 * Resolve a short TikTok URL to its canonical form.
 * Follows redirects to get the full URL with video ID.
 */
export async function resolveTikTokUrl(
  shortUrl: string,
  config: ScraperConfig = {}
): Promise<{ canonicalUrl: string; videoId: string | null }> {
  const timeout = config.timeout ?? 10000
  const maxRedirects = config.maxRedirects ?? 5
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  let currentUrl = shortUrl
  let redirectCount = 0

  while (redirectCount < maxRedirects) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const rawResponse = await fetchFn(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      })
      // Cast to work around Bun's Response type conflicts
      const response = rawResponse as unknown as RedirectResponse

      clearTimeout(timeoutId)

      // Check for redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location) {
          // Handle relative redirects
          currentUrl = location.startsWith('http')
            ? location
            : new URL(location, currentUrl).toString()
          redirectCount++
          continue
        }
      }

      // No more redirects, we have the canonical URL
      break
    } catch {
      clearTimeout(timeoutId)
      break
    }
  }

  return {
    canonicalUrl: currentUrl,
    videoId: extractTikTokVideoId(currentUrl)
  }
}

/**
 * Extract JSON data embedded in TikTok HTML.
 * TikTok embeds video metadata in a script tag with id="__UNIVERSAL_DATA_FOR_REHYDRATION__"
 * or in SIGI_STATE.
 */
function extractTikTokJson(html: string): unknown | null {
  // Try the universal data format first (newer)
  const universalMatch = html.match(
    /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/
  )
  if (universalMatch?.[1]) {
    try {
      return JSON.parse(universalMatch[1])
    } catch {
      // Continue to try other formats
    }
  }

  // Try SIGI_STATE format
  const sigiMatch = html.match(/<script[^>]*id="SIGI_STATE"[^>]*>([^<]+)<\/script>/)
  if (sigiMatch?.[1]) {
    try {
      return JSON.parse(sigiMatch[1])
    } catch {
      // Continue to try other formats
    }
  }

  // Try to find JSON in script tags containing video data
  const scriptMatches = html.matchAll(/<script[^>]*>([^<]*"videoData"[^<]*)<\/script>/g)
  for (const match of scriptMatches) {
    if (match[1]) {
      try {
        return JSON.parse(match[1])
      } catch {
        // Continue
      }
    }
  }

  // Try finding itemInfo or videoInfo patterns in any script
  const itemInfoMatch = html.match(/"itemInfo"\s*:\s*(\{[^}]+(?:\{[^}]*\}[^}]*)*\})/s)
  if (itemInfoMatch?.[1]) {
    try {
      return JSON.parse(`{"itemInfo":${itemInfoMatch[1]}}`)
    } catch {
      // Continue
    }
  }

  return null
}

/**
 * Parse TikTok JSON data into ScrapedMetadata.
 */
function parseTikTokData(
  data: unknown,
  canonicalUrl: string,
  videoId: string | null
): ScrapedMetadata | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  // Try different paths where video data might be stored
  const possiblePaths = [
    ['__DEFAULT_SCOPE__', 'webapp.video-detail', 'itemInfo', 'itemStruct'],
    ['ItemModule'],
    ['itemInfo', 'itemStruct'],
    ['videoData']
  ]

  let videoData: unknown = null

  for (const path of possiblePaths) {
    const found = getNestedValue(data, path)
    if (found) {
      // ItemModule is a dict keyed by video ID
      if (path[0] === 'ItemModule' && typeof found === 'object' && found !== null) {
        const items = Object.values(found)
        videoData = items[0]
      } else {
        videoData = found
      }
      break
    }
  }

  if (!videoData || typeof videoData !== 'object') {
    return null
  }

  const vd = videoData as Record<string, unknown>

  // Extract description (might be in 'desc' or 'description')
  const description = (vd.desc ?? vd.description ?? '') as string

  // Extract hashtags from description and textExtra
  const hashtagsFromDesc = extractHashtags(description)
  const textExtra = vd.textExtra as Array<{ hashtagName?: string }> | undefined
  const hashtagsFromExtra =
    textExtra?.map((t) => t.hashtagName?.toLowerCase()).filter(Boolean) ?? []
  const allHashtags = [...new Set([...hashtagsFromDesc, ...hashtagsFromExtra])] as string[]

  // Extract creator info
  const author = vd.author as Record<string, unknown> | undefined
  const creator = (author?.uniqueId ?? author?.nickname ?? vd.authorUniqueId ?? null) as
    | string
    | null

  // Extract categories/labels
  const diversificationLabels = (vd.diversificationLabels ?? []) as string[]

  // Extract suggested keywords
  const suggestedWords = (vd.suggestedWords ?? []) as string[]

  // Extract thumbnail
  const video = vd.video as Record<string, unknown> | undefined
  const thumbnailUrl = (video?.cover ?? video?.dynamicCover ?? video?.originCover ?? null) as
    | string
    | null

  // Get title - first line of description or first content desc
  const contents = vd.contents as Array<{ desc?: string }> | undefined
  const firstContentDesc = contents?.[0]?.desc
  const title = firstContentDesc ?? description.split('\n')[0]?.slice(0, 100) ?? null

  return {
    platform: 'tiktok',
    canonicalUrl,
    contentId: videoId,
    title,
    description: description || null,
    hashtags: allHashtags,
    creator,
    thumbnailUrl,
    categories: diversificationLabels,
    suggestedKeywords: suggestedWords,
    rawData: data
  }
}

/**
 * Scrape metadata from a TikTok URL.
 */
export async function scrapeTikTok(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  try {
    // First resolve the URL to get canonical form and video ID
    const { canonicalUrl, videoId } = await resolveTikTokUrl(url, config)

    // Fetch the HTML page
    const rawResponse = await fetchFn(canonicalUrl, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache'
      }
    })
    // Cast to work around Bun's Response type conflicts
    const response = rawResponse as unknown as FullResponse

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          error: { type: 'not_found', message: 'Video not found', url }
        }
      }
      if (response.status === 403 || response.status === 429) {
        return {
          ok: false,
          error: { type: 'blocked', message: `Blocked by TikTok (${response.status})`, url }
        }
      }
      return {
        ok: false,
        error: { type: 'network', message: `HTTP ${response.status}`, url }
      }
    }

    const html = await response.text()

    // Extract and parse the embedded JSON
    const jsonData = extractTikTokJson(html)
    if (!jsonData) {
      return {
        ok: false,
        error: { type: 'parse', message: 'Could not find video data in page', url }
      }
    }

    const metadata = parseTikTokData(jsonData, canonicalUrl, videoId)
    return wrapParseResult(metadata, url)
  } catch (error) {
    return networkError(error, url)
  }
}
