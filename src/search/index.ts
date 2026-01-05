/**
 * Entity Resolution Module
 *
 * 5-stage pipeline for resolving entity names to canonical URLs:
 * 1. Wikidata API - SPARQL search by title + type
 * 2. Open Library API - Books only, physical formats with covers
 * 3. Google Search API - Broad search fallback
 * 4. Heuristic Matching - Rule-based, preferred sources
 * 5. AI Classification - Gemini ranking for ambiguous results
 */

import { type ClassificationFullConfig, classifyItem } from './classification'
import { type GoogleSearchFullConfig, searchGoogleForEntity } from './google'
import { tryHeuristicMatch } from './heuristics'
import { type OpenLibrarySearchConfig, searchOpenLibrary } from './openlibrary'
import type {
  EntityType,
  GoogleSearchResult,
  OpenLibraryResult,
  ResolvedEntity,
  ResolverConfig,
  WikidataResult
} from './types'
import { DEFAULT_USER_AGENT, EXTERNAL_ID_URL_TEMPLATES } from './types'
import { searchWikidata, type WikidataSearchConfig } from './wikidata'

export { classificationToMatch, classifyItem, classifyItems, getBestUrl } from './classification'
export { buildSearchQuery, searchGoogle, searchGoogleForEntity } from './google'
export {
  applyHeuristics,
  extractContentWords,
  getCanonicalUrl,
  getSource,
  normalizeUnicode,
  tryHeuristicMatch
} from './heuristics'
export { searchOpenLibrary } from './openlibrary'
// Re-export types
export * from './types'
// Re-export functions for direct use
export { searchWikidata } from './wikidata'

/**
 * Convert Wikidata result to ResolvedEntity.
 */
function wikidataToEntity(result: WikidataResult, title: string, type: EntityType): ResolvedEntity {
  const url = result.wikipediaUrl ?? `https://www.wikidata.org/wiki/${result.qid}`

  return {
    id: result.qid,
    source: 'wikidata',
    title: result.label || title,
    url,
    type,
    description: result.description,
    imageUrl: result.imageUrl,
    wikipediaUrl: result.wikipediaUrl,
    externalIds: {}
  }
}

/**
 * Convert Open Library result to ResolvedEntity.
 */
function openLibraryToEntity(result: OpenLibraryResult, type: EntityType): ResolvedEntity {
  return {
    id: result.workId,
    source: 'openlibrary',
    title: result.title,
    url: result.workUrl,
    type,
    year: result.firstPublishYear,
    description: result.author ? `by ${result.author}` : undefined,
    imageUrl: result.coverUrl,
    externalIds: {
      openlibrary: result.workId
    }
  }
}

/**
 * Extract external ID from URL based on source.
 */
function extractExternalId(url: string, source: string): Partial<Record<string, string>> {
  const externalIds: Partial<Record<string, string>> = {}

  if (source === 'imdb') {
    const match = url.match(/\/title\/(tt\d+)/)
    if (match?.[1]) externalIds.imdb = match[1]
  } else if (source === 'goodreads') {
    const match = url.match(/\/book\/show\/(\d+)/)
    if (match?.[1]) externalIds.goodreads = match[1]
  } else if (source === 'bgg') {
    const match = url.match(/\/boardgame\/(\d+)/)
    if (match?.[1]) externalIds.bgg = match[1]
  } else if (source === 'steam') {
    const match = url.match(/\/app\/(\d+)/)
    if (match?.[1]) externalIds.steam = match[1]
  }

  return externalIds
}

/**
 * Convert heuristic/AI match to ResolvedEntity.
 */
function matchToEntity(
  url: string,
  source: string,
  title: string,
  type: EntityType
): ResolvedEntity {
  return {
    id: url,
    source: source === 'ai' ? 'ai' : 'heuristic',
    title,
    url,
    type,
    externalIds: extractExternalId(url, source)
  }
}

/**
 * Determine source name from URL.
 */
function determineSourceFromUrl(url: string): string {
  const urlLower = url.toLowerCase()
  if (urlLower.includes('imdb.com')) return 'imdb'
  if (urlLower.includes('goodreads.com')) return 'goodreads'
  if (urlLower.includes('wikipedia.org')) return 'wikipedia'
  if (urlLower.includes('spotify.com')) return 'spotify'
  if (urlLower.includes('boardgamegeek.com')) return 'bgg'
  if (urlLower.includes('steam')) return 'steam'
  if (urlLower.includes('amazon.com')) return 'amazon'
  return 'ai'
}

/**
 * Stage 1: Try Wikidata API.
 */
async function tryWikidataStage(
  query: string,
  type: EntityType,
  config: ResolverConfig,
  userAgent: string,
  timeout: number
): Promise<ResolvedEntity | null> {
  if (config.wikidata === false) {
    return null
  }

  const wikidataConfig: WikidataSearchConfig = {
    cache: config.cache,
    userAgent,
    timeout
  }

  const result = await searchWikidata(query, type, wikidataConfig)
  if (result && (result.imageUrl || result.wikipediaUrl)) {
    return wikidataToEntity(result, query, type)
  }

  return null
}

/**
 * Stage 2: Try Open Library API.
 */
async function tryOpenLibraryStage(
  query: string,
  author: string | undefined,
  config: ResolverConfig,
  userAgent: string,
  timeout: number
): Promise<ResolvedEntity | null> {
  if (config.openlibrary === false) {
    return null
  }

  const openLibraryConfig: OpenLibrarySearchConfig = {
    cache: config.cache,
    userAgent,
    timeout
  }

  const result = await searchOpenLibrary(query, author, openLibraryConfig)
  if (result?.coverUrl) {
    return openLibraryToEntity(result, 'book')
  }

  return null
}

/**
 * Stage 5: Try AI classification.
 */
async function tryAIClassificationStage(
  title: string,
  type: EntityType,
  searchResults: GoogleSearchResult[],
  config: ResolverConfig,
  timeout: number
): Promise<ResolvedEntity | null> {
  if (!config.aiClassification) {
    return null
  }

  const classificationConfig: ClassificationFullConfig = {
    apiKey: config.aiClassification.apiKey,
    model: config.aiClassification.model,
    cache: config.cache,
    timeout
  }

  const classificationResult = await classifyItem(
    { title, category: type, searchResults },
    classificationConfig
  )

  if (classificationResult.rankedUrls.length > 0) {
    const bestUrl = classificationResult.rankedUrls[0]
    if (bestUrl) {
      const source = determineSourceFromUrl(bestUrl)
      return matchToEntity(bestUrl, source, title, type)
    }
  }

  return null
}

/**
 * Stages 3-5: Google Search + Heuristics + AI.
 */
async function tryGoogleSearchStages(
  query: string,
  type: EntityType,
  config: ResolverConfig,
  timeout: number,
  author?: string
): Promise<ResolvedEntity | null> {
  if (!config.googleSearch) {
    return null
  }

  const googleConfig: GoogleSearchFullConfig = {
    apiKey: config.googleSearch.apiKey,
    cx: config.googleSearch.cx,
    cache: config.cache,
    timeout
  }

  let searchResults: GoogleSearchResult[]
  try {
    searchResults = await searchGoogleForEntity(query, type, googleConfig, author)
  } catch {
    return null
  }

  if (searchResults.length === 0) {
    return null
  }

  // Stage 4: Heuristic matching
  const heuristicMatch = tryHeuristicMatch(query, type, searchResults)
  if (heuristicMatch) {
    return matchToEntity(heuristicMatch.url, heuristicMatch.source, query, type)
  }

  // Stage 5: AI classification
  return tryAIClassificationStage(query, type, searchResults, config, timeout)
}

/**
 * Resolve an entity to its canonical URL and metadata.
 *
 * Runs the 5-stage resolution pipeline:
 * 1. Wikidata API (if enabled)
 * 2. Open Library API (for books, if enabled)
 * 3. Google Search API (if configured)
 * 4. Heuristic matching
 * 5. AI classification (if configured and heuristics fail)
 *
 * @param query - Entity name to resolve (e.g., "The Matrix", "Pride and Prejudice")
 * @param type - Entity type for filtering (movie, book, etc.)
 * @param config - Resolver configuration
 * @returns ResolvedEntity if found, null otherwise
 */
export async function resolveEntity(
  query: string,
  type: EntityType,
  config: ResolverConfig = {}
): Promise<ResolvedEntity | null> {
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const timeout = config.timeout ?? 30000

  // Stage 1: Wikidata API
  const wikidataResult = await tryWikidataStage(query, type, config, userAgent, timeout)
  if (wikidataResult) {
    return wikidataResult
  }

  // Stage 2: Open Library API (for books only)
  if (type === 'book') {
    const openLibraryResult = await tryOpenLibraryStage(
      query,
      undefined,
      config,
      userAgent,
      timeout
    )
    if (openLibraryResult) {
      return openLibraryResult
    }
  }

  // Stages 3-5: Google Search + Heuristics + AI
  return tryGoogleSearchStages(query, type, config, timeout)
}

/**
 * Resolve a book entity with author hint.
 *
 * Similar to resolveEntity but includes author for better matching.
 *
 * @param title - Book title
 * @param author - Author name (optional but improves accuracy)
 * @param config - Resolver configuration
 * @returns ResolvedEntity if found, null otherwise
 */
export async function resolveBook(
  title: string,
  author: string | undefined,
  config: ResolverConfig = {}
): Promise<ResolvedEntity | null> {
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT
  const timeout = config.timeout ?? 30000

  // Stage 1: Wikidata API
  const wikidataResult = await tryWikidataStage(title, 'book', config, userAgent, timeout)
  if (wikidataResult) {
    return wikidataResult
  }

  // Stage 2: Open Library API with author
  const openLibraryResult = await tryOpenLibraryStage(title, author, config, userAgent, timeout)
  if (openLibraryResult) {
    return openLibraryResult
  }

  // Stages 3-5: Google Search with author + Heuristics + AI
  return tryGoogleSearchStages(title, 'book', config, timeout, author)
}

/**
 * Build canonical URL from external ID.
 *
 * @param idType - External ID type (imdb, goodreads, etc.)
 * @param id - The ID value
 * @returns Canonical URL or null if template not found
 */
export function buildCanonicalUrl(
  idType: keyof typeof EXTERNAL_ID_URL_TEMPLATES,
  id: string
): string | null {
  const template = EXTERNAL_ID_URL_TEMPLATES[idType]
  if (!template) {
    return null
  }
  return template.replace('{id}', id)
}
