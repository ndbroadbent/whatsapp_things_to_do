/**
 * Reddit Scraper
 *
 * Scrape Reddit posts using their JSON API.
 * Handles short URLs (reddit.com/r/.../s/...) by following redirects.
 */

import { guardedFetch } from '../http'
import type { FetchFn, ScrapedMetadata, ScrapeOutcome, ScraperConfig } from './types'
import { networkError } from './utils'

/** Reddit API user agent - must be descriptive per Reddit API rules */
const REDDIT_USER_AGENT = 'chattomap:scraper:v1.0'

/** Regex to detect Reddit URLs */
const REDDIT_URL_REGEX = /^https?:\/\/(www\.)?(reddit\.com|redd\.it)\//i

/** Regex to extract post ID from URL */
const POST_ID_REGEX = /\/comments\/([a-z0-9]+)\//i

/** Regex to detect short share URLs that need redirect resolution */
const SHORT_URL_REGEX = /\/r\/[^/]+\/s\/[a-zA-Z0-9]+/

/**
 * Check if a URL is a Reddit URL.
 */
export function isRedditUrl(url: string): boolean {
  return REDDIT_URL_REGEX.test(url)
}

/**
 * Extract post ID from a Reddit URL.
 */
export function extractRedditPostId(url: string): string | null {
  const match = url.match(POST_ID_REGEX)
  return match?.[1] ?? null
}

/**
 * Check if URL is a short share URL that needs redirect resolution.
 */
function isShortUrl(url: string): boolean {
  return SHORT_URL_REGEX.test(url)
}

/** Response with standard properties (Bun types are overly strict) */
interface FetchResponse {
  url: string
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}

/**
 * Follow redirects to resolve short URLs to full post URLs.
 */
async function resolveRedirectUrl(
  url: string,
  fetchFn: FetchFn,
  timeout: number
): Promise<string | null> {
  try {
    const rawResponse = await fetchFn(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': REDDIT_USER_AGENT }
    })
    const response = rawResponse as unknown as FetchResponse

    // The final URL after redirects
    if (response.url && response.url !== url) {
      return response.url
    }

    // Check Location header if present
    const location = response.headers.get('location')
    if (location) {
      return location
    }

    return null
  } catch {
    return null
  }
}

/**
 * Parse Reddit JSON API response into ScrapedMetadata.
 */
function parseRedditJson(data: unknown, canonicalUrl: string): ScrapedMetadata | null {
  if (!Array.isArray(data) || data.length === 0) return null

  const listing = data[0] as { data?: { children?: Array<{ data?: unknown }> } }
  const children = listing?.data?.children
  if (!children || children.length === 0) return null

  const post = children[0]?.data as Record<string, unknown> | undefined
  if (!post) return null

  const title = (post.title as string) ?? null
  const subreddit = (post.subreddit as string) ?? null
  const author = (post.author as string) ?? null
  const postId = (post.id as string) ?? null
  const selftext = (post.selftext as string) ?? null
  const thumbnail = (post.thumbnail as string) ?? null
  const permalink = (post.permalink as string) ?? null

  // Build description from selftext or subreddit info
  let description = selftext?.slice(0, 300) ?? null
  if (!description && subreddit) {
    description = `Posted in r/${subreddit}`
    if (author) description += ` by u/${author}`
  }

  // Get thumbnail if it's a valid URL (not "self", "default", "nsfw", etc.)
  const imageUrl = thumbnail?.startsWith('http') ? thumbnail.replace(/&amp;/g, '&') : null

  // Extract hashtags from title (rare on Reddit but possible)
  const hashtags: string[] = []
  const hashtagMatches = title?.match(/#[\w]+/g)
  if (hashtagMatches) {
    hashtags.push(...hashtagMatches.map((t) => t.slice(1).toLowerCase()))
  }

  return {
    canonicalUrl: canonicalUrl || (permalink ? `https://www.reddit.com${permalink}` : canonicalUrl),
    contentId: postId,
    title,
    description,
    hashtags,
    creator: author,
    creatorId: author ? `u/${author}` : null,
    imageUrl,
    categories: subreddit ? [`r/${subreddit}`] : [],
    suggestedKeywords: subreddit ? [subreddit] : []
  }
}

/**
 * Scrape Reddit post metadata using the JSON API.
 */
export async function scrapeReddit(
  url: string,
  config: ScraperConfig = {}
): Promise<ScrapeOutcome> {
  const timeout = config.timeout ?? 10000
  const fetchFn: FetchFn = config.fetch ?? guardedFetch

  let resolvedUrl = url

  // Resolve short URLs first
  if (isShortUrl(url)) {
    const redirected = await resolveRedirectUrl(url, fetchFn, timeout)
    if (redirected) {
      resolvedUrl = redirected
    } else {
      return {
        ok: false,
        error: { type: 'network', message: 'Failed to resolve short URL', url }
      }
    }
  }

  // Extract post ID to verify it's a valid post URL
  const postId = extractRedditPostId(resolvedUrl)
  if (!postId) {
    return {
      ok: false,
      error: { type: 'parse', message: 'Could not extract post ID from URL', url }
    }
  }

  // Build JSON API URL - strip query params and add .json
  const baseUrl = resolvedUrl.split('?')[0] ?? resolvedUrl
  const jsonUrl = `${baseUrl.replace(/\/$/, '')}.json`

  try {
    const rawResponse = await fetchFn(jsonUrl, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        'User-Agent': REDDIT_USER_AGENT,
        Accept: 'application/json'
      }
    })
    const response = rawResponse as unknown as FetchResponse

    if (!response.ok) {
      if (response.status === 404) {
        return { ok: false, error: { type: 'not_found', message: 'Post not found', url } }
      }
      if (response.status === 403 || response.status === 429) {
        return {
          ok: false,
          error: { type: 'blocked', message: `Blocked by Reddit (${response.status})`, url }
        }
      }
      return {
        ok: false,
        error: { type: 'network', message: `HTTP ${response.status}`, url }
      }
    }

    const data = await response.json()
    const metadata = parseRedditJson(data, baseUrl)

    if (!metadata) {
      return {
        ok: false,
        error: { type: 'parse', message: 'Could not parse Reddit response', url }
      }
    }

    return { ok: true, metadata }
  } catch (error) {
    return networkError(error, url)
  }
}
