/**
 * Google Programmable Search API Integration
 *
 * Stage 3 of the entity resolution pipeline.
 * Broad search for entities when Wikidata/OpenLibrary fail.
 */

import { generateCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { type HttpResponse, httpFetch } from '../http'
import type { EntityType, GoogleSearchConfig, GoogleSearchResult } from './types'
import { DEFAULT_TIMEOUT } from './types'

const GOOGLE_SEARCH_API = 'https://www.googleapis.com/customsearch/v1'

/**
 * Full configuration for Google search.
 */
export interface GoogleSearchFullConfig extends GoogleSearchConfig {
  /** Response cache for API calls */
  cache?: ResponseCache | undefined
  /** Request timeout in milliseconds */
  timeout?: number | undefined
  /** Custom fetch function (for testing) */
  customFetch?: typeof fetch | undefined
}

/**
 * Build a category-aware search query.
 *
 * Appends category hint to improve search relevance.
 */
export function buildSearchQuery(title: string, category: EntityType): string {
  switch (category) {
    case 'movie':
      return `${title} film`
    case 'tv_show':
      return `${title} tv series`
    case 'book':
      return `${title} book`
    case 'video_game':
      return `${title} video game`
    case 'physical_game':
      return `${title} board game`
    case 'album':
      return `${title} album music`
    case 'song':
      return `${title} song music`
    case 'podcast':
      return `${title} podcast`
    case 'artist':
      return `${title} musician artist`
    case 'theatre':
      return `${title} play theatre`
    case 'comic':
      return `${title} comic`
    case 'web_series':
      return `${title} web series`
    case 'media':
      return `${title} movie tv show`
    case 'game':
      return `${title} video game board game`
    default:
      return title
  }
}

/**
 * Build search query with optional author (for books).
 */
function buildSearchQueryWithAuthor(title: string, category: EntityType, author?: string): string {
  if (category === 'book' && author) {
    return `${title} book ${author}`
  }
  return buildSearchQuery(title, category)
}

/**
 * Search Google using Programmable Search API.
 *
 * @param query - Search query string
 * @param config - API configuration with key and cx
 * @returns Array of search results (up to 5)
 */
export async function searchGoogle(
  query: string,
  config: GoogleSearchFullConfig
): Promise<GoogleSearchResult[]> {
  const timeout = config.timeout ?? DEFAULT_TIMEOUT

  // Check cache first
  if (config.cache) {
    const cacheKey = generateCacheKey({
      service: 'google',
      model: 'search',
      payload: { query, cx: config.cx }
    })

    const cached = await config.cache.get<GoogleSearchResult[]>(cacheKey)
    if (cached) {
      return cached.data
    }

    // Execute search and cache result
    const results = await executeGoogleSearch(query, config, timeout)
    await config.cache.set(cacheKey, { data: results, cachedAt: Date.now() })
    return results
  }

  return executeGoogleSearch(query, config, timeout)
}

async function executeGoogleSearch(
  query: string,
  config: GoogleSearchFullConfig,
  timeout: number
): Promise<GoogleSearchResult[]> {
  const params = new URLSearchParams({
    key: config.apiKey,
    cx: config.cx,
    q: query,
    num: '5' // Top 5 results
  })

  const url = `${GOOGLE_SEARCH_API}?${params.toString()}`

  let response: HttpResponse
  if (config.customFetch) {
    const fetchResponse = await config.customFetch(url, {
      signal: AbortSignal.timeout(timeout)
    })
    response = fetchResponse as unknown as HttpResponse
  } else {
    response = await httpFetch(url, {
      signal: AbortSignal.timeout(timeout)
    })
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google Search API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    items?: Array<{
      title?: string
      link?: string
      snippet?: string
    }>
  }

  return (data.items ?? []).map((item) => ({
    title: item.title ?? '',
    url: item.link ?? '',
    snippet: item.snippet
  }))
}

/**
 * Search Google for an entity with category-aware query.
 *
 * @param title - Entity title
 * @param category - Entity category
 * @param config - API configuration
 * @param author - Optional author (for books)
 * @returns Array of search results
 */
export async function searchGoogleForEntity(
  title: string,
  category: EntityType,
  config: GoogleSearchFullConfig,
  author?: string
): Promise<GoogleSearchResult[]> {
  const query = buildSearchQueryWithAuthor(title, category, author)
  return searchGoogle(query, config)
}
