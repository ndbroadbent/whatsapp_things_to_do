/**
 * YouTube Scraper
 *
 * Extract metadata from YouTube video URLs.
 *
 * YouTube embeds rich JSON data in their HTML pages including:
 * - ytInitialPlayerResponse - video details, description
 * - ytInitialData - additional metadata, categories
 * - JSON-LD structured data
 */

import { guardedFetch } from '../http'
import type { FetchFn, ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types'
import { extractHashtags, getNestedValue, networkError, wrapParseResult } from './utils'

/**
 * Full response interface for content fetching.
 * Uses type assertion to work around Bun's Response type conflicts.
 */
interface FullResponse {
  url: string
  ok: boolean
  status: number
  text(): Promise<string>
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Extract video ID from a YouTube URL.
 * Handles various YouTube URL formats.
 */
export function extractYouTubeVideoId(url: string): string | null {
  // Standard watch URL: youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  if (watchMatch?.[1]) {
    return watchMatch[1]
  }

  // Short URL: youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  if (shortMatch?.[1]) {
    return shortMatch[1]
  }

  // Embed URL: youtube.com/embed/VIDEO_ID or youtube-nocookie.com/embed/VIDEO_ID
  const embedMatch = url.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  if (embedMatch?.[1]) {
    return embedMatch[1]
  }

  // Shorts URL: youtube.com/shorts/VIDEO_ID
  const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
  if (shortsMatch?.[1]) {
    return shortsMatch[1]
  }

  return null
}

/**
 * Build canonical YouTube URL from video ID.
 */
export function buildYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Find the end of a JSON object by counting balanced braces.
 * Returns the index of the closing brace, or -1 if not found.
 */
function findJsonEnd(html: string, startIndex: number): number {
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let i = startIndex; i < html.length; i++) {
    const char = html[i]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (char === '\\' && inString) {
      isEscaped = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (!inString) {
      if (char === '{') depth++
      if (char === '}') {
        depth--
        if (depth === 0) return i
      }
    }
  }

  return -1
}

/**
 * Extract ytInitialPlayerResponse JSON from YouTube HTML.
 */
function extractPlayerResponse(html: string): unknown | null {
  // Pattern: var ytInitialPlayerResponse = {...};
  const match = html.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});/s)
  if (match?.[1]) {
    try {
      return JSON.parse(match[1])
    } catch {
      // Regex captured too little or too much - try manual extraction
    }
  }

  // Manual extraction with balanced brace counting
  const marker = 'var ytInitialPlayerResponse = '
  const start = html.indexOf(marker)
  if (start === -1) return null

  const jsonStart = start + marker.length
  const jsonEnd = findJsonEnd(html, jsonStart)
  if (jsonEnd === -1) return null

  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd + 1))
  } catch {
    return null
  }
}

/**
 * Extract ytInitialData JSON from YouTube HTML.
 */
function extractInitialData(html: string): unknown | null {
  const match = html.match(/var\s+ytInitialData\s*=\s*(\{.+?\});/s)
  if (match?.[1]) {
    try {
      return JSON.parse(match[1])
    } catch {
      // Fallback: manual JSON extraction
    }
  }
  return null
}

/**
 * Parse YouTube JSON data into ScrapedMetadata.
 */
function parseYouTubeData(
  playerResponse: unknown,
  _initialData: unknown,
  canonicalUrl: string,
  videoId: string
): ScrapedMetadata | null {
  if (!playerResponse || typeof playerResponse !== 'object') {
    return null
  }

  const pr = playerResponse as Record<string, unknown>

  // Extract video details
  const videoDetails = pr.videoDetails as Record<string, unknown> | undefined
  if (!videoDetails) {
    return null
  }

  const title = (videoDetails.title ?? null) as string | null
  const description = (videoDetails.shortDescription ?? null) as string | null
  const creator = (videoDetails.author ?? null) as string | null
  const channelId = videoDetails.channelId as string | undefined

  // Extract hashtags from description
  const hashtags = description ? extractHashtags(description) : []

  // Extract thumbnail
  const thumbnails = getNestedValue(videoDetails, ['thumbnail', 'thumbnails']) as
    | Array<{ url: string }>
    | undefined
  const thumbnailUrl = thumbnails?.[thumbnails.length - 1]?.url ?? null

  // Extract keywords (tags)
  const keywords = (videoDetails.keywords ?? []) as string[]

  // Extract category from microformat
  const category = getNestedValue(pr, ['microformat', 'playerMicroformatRenderer', 'category']) as
    | string
    | undefined
  const categories = category ? [category] : []

  return {
    canonicalUrl,
    contentId: videoId,
    title,
    description,
    hashtags,
    creator,
    creatorId: channelId ?? null,
    thumbnailUrl,
    categories,
    suggestedKeywords: keywords,
    rawData: playerResponse
  }
}

/**
 * Scrape metadata from a YouTube URL.
 */
export async function scrapeYouTube(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  try {
    // Extract video ID from URL
    const videoId = extractYouTubeVideoId(url)
    if (!videoId) {
      return {
        ok: false,
        error: { type: 'parse', message: 'Could not extract video ID from URL', url }
      }
    }

    const canonicalUrl = buildYouTubeUrl(videoId)

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
    const response = rawResponse as unknown as FullResponse

    if (!response.ok) {
      if (response.status === 404) {
        return {
          ok: false,
          error: { type: 'not_found', message: 'Video not found', url }
        }
      }
      return {
        ok: false,
        error: { type: 'network', message: `HTTP ${response.status}`, url }
      }
    }

    const html = await response.text()

    // Extract embedded JSON
    const playerResponse = extractPlayerResponse(html)
    const initialData = extractInitialData(html)

    if (!playerResponse) {
      return {
        ok: false,
        error: { type: 'parse', message: 'Could not find video data in page', url }
      }
    }

    const metadata = parseYouTubeData(playerResponse, initialData, canonicalUrl, videoId)
    return wrapParseResult(metadata, url)
  } catch (error) {
    return networkError(error, url)
  }
}
