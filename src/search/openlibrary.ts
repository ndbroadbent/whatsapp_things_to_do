/**
 * Open Library API Integration
 *
 * Stage 2 of the entity resolution pipeline.
 * Searches Open Library for books by title/author, filters for valid physical formats.
 */

import { generateCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { type HttpResponse, httpFetch } from '../http'
import type { OpenLibraryResult } from './types'
import { DEFAULT_TIMEOUT, DEFAULT_USER_AGENT } from './types'

const SEARCH_API = 'https://openlibrary.org/search.json'

/**
 * Fetch function type that returns HttpResponse.
 */
type FetchFn = (url: string, init?: RequestInit) => Promise<HttpResponse>

/**
 * Configuration for Open Library search.
 */
export interface OpenLibrarySearchConfig {
  /** Response cache for API calls */
  cache?: ResponseCache | undefined
  /** User agent for API requests */
  userAgent?: string | undefined
  /** Request timeout in milliseconds */
  timeout?: number | undefined
  /** Custom fetch function (for testing) */
  customFetch?: FetchFn | undefined
}

/**
 * Open Library search result document.
 */
interface OpenLibraryDoc {
  key: string // e.g., "/works/OL123W"
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
}

/**
 * Open Library edition entry.
 */
interface OpenLibraryEdition {
  key: string // e.g., "/books/OL456M"
  covers?: number[]
  physical_format?: string
}

/**
 * Check if format is a valid physical book (not audiobook).
 */
function isValidBookFormat(format: string | undefined): boolean {
  if (!format) return true
  const f = format.toLowerCase()
  return !f.includes('audio') && !f.includes('cd') && !f.includes('mp3')
}

/**
 * Normalize title for comparison.
 */
function normalizeTitle(title: string): string {
  if (!title) return ''
  let t = title.toLowerCase()
  for (const char of '.:,;!?()[]{}"\'-—–') {
    t = t.replaceAll(char, ' ')
  }
  return t.split(/\s+/).join(' ').trim()
}

/**
 * Check if titles match exactly, or found has a colon subtitle.
 */
function titlesMatch(expected: string, found: string): boolean {
  const exp = normalizeTitle(expected)
  const foundNorm = normalizeTitle(found)

  if (exp === foundNorm) return true

  if (found.includes(':')) {
    const parts = found.split(':')
    const mainTitle = parts[0]
    if (mainTitle && normalizeTitle(mainTitle.trim()) === exp) return true
  }

  return false
}

/**
 * Extract first author keyword from author string.
 */
function parseAuthorKeyword(author: string): string {
  const parts = author.split('&')
  const firstPart = parts[0] ?? ''
  const andParts = firstPart.split(' and ')
  const secondPart = andParts[0] ?? ''
  const commaParts = secondPart.split(',')
  return (commaParts[0] ?? '').trim()
}

/**
 * Get editions for a work to check formats.
 */
async function getWorkEditions(
  workId: string,
  config: OpenLibrarySearchConfig
): Promise<OpenLibraryEdition[]> {
  const fetchFn: FetchFn = config.customFetch ?? httpFetch
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const timeout = config.timeout ?? DEFAULT_TIMEOUT

  const url = `https://openlibrary.org/works/${workId}/editions.json?limit=20`

  try {
    const response = await fetchFn(url, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeout)
    })

    if (!response.ok) return []

    const data = (await response.json()) as { entries?: OpenLibraryEdition[] }
    return data.entries ?? []
  } catch {
    return []
  }
}

/**
 * Find an edition with cover that's not an audiobook.
 */
function findEditionWithCover(
  editions: OpenLibraryEdition[]
): { editionId: string; coverId: number; format: string | undefined } | null {
  for (const ed of editions) {
    const covers = ed.covers ?? []
    if (covers.length === 0) continue

    const physicalFormat = ed.physical_format
    if (!isValidBookFormat(physicalFormat)) continue

    const edKey = ed.key ?? ''
    const edId = edKey.split('/').pop() ?? ''
    const firstCover = covers[0]

    if (firstCover === undefined) continue

    return { editionId: edId, coverId: firstCover, format: physicalFormat }
  }
  return null
}

/**
 * Build result from document with valid edition.
 */
function buildResultWithEdition(
  doc: OpenLibraryDoc,
  workId: string,
  validEdition: { editionId: string; coverId: number; format: string | undefined }
): OpenLibraryResult {
  return {
    workId,
    editionId: validEdition.editionId,
    title: doc.title ?? '',
    author: doc.author_name?.join(', '),
    coverUrl: `https://covers.openlibrary.org/b/id/${validEdition.coverId}-L.jpg`,
    workUrl: `https://openlibrary.org/works/${workId}`,
    editionUrl: `https://openlibrary.org/books/${validEdition.editionId}`,
    format: validEdition.format,
    firstPublishYear: doc.first_publish_year
  }
}

/**
 * Build basic result from document without edition.
 */
function buildBasicResult(doc: OpenLibraryDoc, workId: string): OpenLibraryResult {
  return {
    workId,
    title: doc.title ?? '',
    author: doc.author_name?.join(', '),
    workUrl: workId ? `https://openlibrary.org/works/${workId}` : '',
    firstPublishYear: doc.first_publish_year
  }
}

/**
 * Find valid edition among matching docs.
 */
async function findValidEditionInDocs(
  matchingDocs: OpenLibraryDoc[],
  config: OpenLibrarySearchConfig
): Promise<OpenLibraryResult | null> {
  for (const doc of matchingDocs) {
    const workKey = doc.key ?? ''
    const workId = workKey.split('/').pop() ?? ''

    if (!workId) continue

    const editions = await getWorkEditions(workId, config)
    const validEdition = findEditionWithCover(editions)

    if (validEdition) {
      return buildResultWithEdition(doc, workId, validEdition)
    }
  }
  return null
}

/**
 * Execute search and process results.
 */
async function executeSearch(
  title: string,
  author: string | undefined,
  config: OpenLibrarySearchConfig,
  fetchFn: FetchFn,
  userAgent: string,
  timeout: number
): Promise<OpenLibraryResult | null> {
  const params = new URLSearchParams({ title, limit: '5' })

  if (author) {
    const authorKeyword = parseAuthorKeyword(author)
    if (authorKeyword) {
      params.set('author', authorKeyword)
    }
  }

  const url = `${SEARCH_API}?${params.toString()}`

  const response = await fetchFn(url, {
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(timeout)
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { docs?: OpenLibraryDoc[] }
  const docs = data.docs ?? []

  if (docs.length === 0) {
    return null
  }

  const matchingDocs = docs.filter((doc) => titlesMatch(title, doc.title ?? ''))

  if (matchingDocs.length === 0) {
    return null
  }

  // Try to find valid edition with cover
  const resultWithEdition = await findValidEditionInDocs(matchingDocs, config)
  if (resultWithEdition) {
    return resultWithEdition
  }

  // No valid edition found - return basic info
  const firstDoc = matchingDocs[0]
  if (!firstDoc) {
    return null
  }

  const workKey = firstDoc.key ?? ''
  const workId = workKey.split('/').pop() ?? ''
  return buildBasicResult(firstDoc, workId)
}

/**
 * Search Open Library for a book by title and optionally author.
 *
 * @param title - Book title to search for
 * @param author - Optional author name (improves search accuracy)
 * @param config - Search configuration
 * @returns OpenLibraryResult if found, null otherwise
 */
export async function searchOpenLibrary(
  title: string,
  author: string | undefined,
  config: OpenLibrarySearchConfig = {}
): Promise<OpenLibraryResult | null> {
  const fetchFn: FetchFn = config.customFetch ?? httpFetch
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const timeout = config.timeout ?? DEFAULT_TIMEOUT

  // Check cache first
  const cacheKey = config.cache
    ? generateCacheKey({
        service: 'openlibrary',
        model: 'search',
        payload: { title, author: author ?? '' }
      })
    : null

  if (config.cache && cacheKey) {
    const cached = await config.cache.get<OpenLibraryResult | null>(cacheKey)
    if (cached) {
      return cached.data
    }
  }

  try {
    const result = await executeSearch(title, author, config, fetchFn, userAgent, timeout)

    if (config.cache && cacheKey) {
      await config.cache.set(cacheKey, { data: result, cachedAt: Date.now() })
    }

    return result
  } catch {
    return null
  }
}
