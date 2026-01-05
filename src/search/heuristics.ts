/**
 * Heuristic Matching for Google Search Results
 *
 * Stage 4 of the entity resolution pipeline.
 * Rule-based matching to resolve obvious matches without AI.
 */

import type { DeferredItem, EntityType, GoogleSearchResult, HeuristicMatch } from './types'
import { FILLER_WORDS, PREFERRED_SOURCES } from './types'

/**
 * Normalize unicode by removing diacritics/accents.
 */
export function normalizeUnicode(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Extract content words from a title, removing filler words and punctuation.
 */
export function extractContentWords(title: string): Set<string> {
  let s = title.toLowerCase()
  // Normalize diacritics (māori -> maori)
  s = normalizeUnicode(s)
  // Remove punctuation
  s = s.replace(/[&\-?!:,.'"[\]«»()]/g, ' ')
  // Split and filter
  const words = s.split(/\s+/)
  return new Set(words.filter((w) => !FILLER_WORDS.has(w) && w.length > 1))
}

/**
 * Get source name from URL.
 */
export function getSource(url: string): string | null {
  const urlLower = url.toLowerCase()
  if (urlLower.includes('imdb.com')) return 'imdb'
  if (urlLower.includes('goodreads.com')) return 'goodreads'
  if (urlLower.includes('amazon.com') || urlLower.includes('amazon.co.')) return 'amazon'
  if (urlLower.includes('wikipedia.org')) return 'wikipedia'
  if (urlLower.includes('rottentomatoes.com')) return 'rottentomatoes'
  if (urlLower.includes('penguin.')) return 'penguin'
  if (urlLower.includes('store.steampowered.com')) return 'steam'
  if (urlLower.includes('boardgamegeek.com')) return 'bgg'
  if (urlLower.includes('open.spotify.com')) return 'spotify'
  if (urlLower.includes('musicbrainz.org')) return 'musicbrainz'
  if (urlLower.includes('igdb.com')) return 'igdb'
  if (urlLower.includes('letterboxd.com')) return 'letterboxd'
  return null
}

/**
 * Extract unique ID from URL for deduplication.
 */
function getSourceId(url: string, source: string): string | null {
  if (source === 'imdb') {
    const match = url.match(/\/title\/(tt\d+)/)
    return match?.[1] ?? null
  }
  if (source === 'goodreads') {
    const match = url.match(/\/book\/show\/(\d+)/)
    return match?.[1] ?? null
  }
  if (source === 'bgg') {
    const match = url.match(/\/boardgame\/(\d+)/)
    return match?.[1] ?? null
  }
  if (source === 'steam') {
    const match = url.match(/\/app\/(\d+)/)
    return match?.[1] ?? null
  }
  if (source === 'spotify') {
    const match = url.match(/\/(album|artist)\/([a-zA-Z0-9]+)/)
    return match?.[2] ?? null
  }
  return null
}

/**
 * Get canonical (root) URL for a source.
 */
export function getCanonicalUrl(url: string, source: string): string {
  if (source === 'imdb') {
    const match = url.match(/(https?:\/\/[^/]*imdb\.com\/title\/tt\d+)/)
    const captured = match?.[1]
    return captured ? `${captured}/` : url
  }
  if (source === 'goodreads') {
    const match = url.match(/(https?:\/\/[^/]*goodreads\.com\/book\/show\/\d+)/)
    return match?.[1] ?? url
  }
  if (source === 'bgg') {
    const match = url.match(/(https?:\/\/[^/]*boardgamegeek\.com\/boardgame\/\d+)/)
    return match?.[1] ?? url
  }
  if (source === 'steam') {
    const match = url.match(/(https?:\/\/store\.steampowered\.com\/app\/\d+)/)
    return match?.[1] ?? url
  }
  return url
}

/**
 * Check if URL is from a preferred source for this category.
 */
function isPreferredSource(
  url: string,
  category: EntityType
): { isPreferred: boolean; source: string | null } {
  const source = getSource(url)
  if (!source) {
    return { isPreferred: false, source: null }
  }

  const preferred = PREFERRED_SOURCES[category]
  if (!preferred) {
    return { isPreferred: false, source }
  }

  for (const [domain] of preferred) {
    if (url.toLowerCase().includes(domain)) {
      return { isPreferred: true, source }
    }
  }

  return { isPreferred: false, source }
}

/**
 * Check if all query content words appear in the result title.
 */
function wordsMatch(queryWords: Set<string>, title: string, _category: EntityType): boolean {
  const titleWords = extractContentWords(title)

  // Remove category hint words from query words
  const categoryHints = new Set(['film', 'tv', 'series', 'book', 'movie', 'game', 'album', 'song'])
  const filteredQueryWords = new Set([...queryWords].filter((w) => !categoryHints.has(w)))

  // All query words must be in title
  for (const word of filteredQueryWords) {
    if (!titleWords.has(word)) {
      return false
    }
  }
  return true
}

/**
 * Result from heuristic matching.
 */
interface HeuristicMatchResult {
  /** Matched items */
  found: HeuristicMatch[]
  /** Items deferred to AI classification */
  deferred: DeferredItem[]
}

/**
 * Get priority order for sources based on category.
 */
function getSourcePriority(category: EntityType): string[] {
  switch (category) {
    case 'movie':
    case 'tv_show':
      return ['imdb', 'wikipedia', 'rottentomatoes', 'letterboxd']
    case 'book':
      return ['goodreads', 'amazon', 'penguin']
    case 'video_game':
      return ['steam', 'igdb', 'wikipedia']
    case 'physical_game':
      return ['bgg', 'wikipedia']
    case 'album':
    case 'song':
      return ['spotify', 'musicbrainz', 'wikipedia']
    default:
      return []
  }
}

/**
 * Collect matches from search results grouped by source.
 */
function collectMatchesBySource(
  results: GoogleSearchResult[],
  queryWords: Set<string>,
  category: EntityType
): Map<string, Map<string, { url: string; title: string }>> {
  const matchesBySource: Map<string, Map<string, { url: string; title: string }>> = new Map()

  for (const result of results) {
    const url = result.url
    const resultTitle = result.title

    const { isPreferred, source } = isPreferredSource(url, category)
    if (!isPreferred || !source) {
      continue
    }

    if (!wordsMatch(queryWords, resultTitle, category)) {
      continue
    }

    const sourceId = getSourceId(url, source) || url
    const canonicalUrl = getCanonicalUrl(url, source)

    let sourceMatches = matchesBySource.get(source)
    if (!sourceMatches) {
      sourceMatches = new Map()
      matchesBySource.set(source, sourceMatches)
    }

    if (!sourceMatches.has(sourceId)) {
      sourceMatches.set(sourceId, { url: canonicalUrl, title: resultTitle })
    }
  }

  return matchesBySource
}

/**
 * Find best match from collected matches using priority order.
 */
function findBestMatch(
  matchesBySource: Map<string, Map<string, { url: string; title: string }>>,
  priority: string[],
  title: string,
  category: EntityType
): HeuristicMatch | null {
  // Use category priority or fall back to all available sources
  const sourcesToCheck = priority.length > 0 ? priority : [...matchesBySource.keys()]

  for (const source of sourcesToCheck) {
    const matches = matchesBySource.get(source)
    if (!matches) continue

    if (matches.size === 1) {
      const matchEntry = [...matches.values()][0]
      if (!matchEntry) continue
      return {
        title,
        category,
        url: matchEntry.url,
        source,
        matchedTitle: matchEntry.title
      }
    }

    if (matches.size > 1) {
      // Multiple unique matches from same source - defer to AI
      return null
    }
  }

  return null
}

/**
 * Try to find a heuristic match for search results.
 *
 * Returns match if found, null if should defer to AI.
 */
export function tryHeuristicMatch(
  title: string,
  category: EntityType,
  results: GoogleSearchResult[]
): HeuristicMatch | null {
  if (results.length === 0) {
    return null
  }

  const queryWords = extractContentWords(title)
  const matchesBySource = collectMatchesBySource(results, queryWords, category)
  const priority = getSourcePriority(category)

  return findBestMatch(matchesBySource, priority, title, category)
}

/**
 * Apply heuristic matching to multiple search results.
 *
 * @param items - Array of items with search results
 * @returns Found matches and deferred items
 */
export function applyHeuristics(
  items: Array<{
    title: string
    category: EntityType
    results: GoogleSearchResult[]
    author?: string
  }>
): HeuristicMatchResult {
  const found: HeuristicMatch[] = []
  const deferred: DeferredItem[] = []

  for (const item of items) {
    const match = tryHeuristicMatch(item.title, item.category, item.results)

    if (match) {
      found.push(match)
    } else {
      deferred.push({
        title: item.title,
        category: item.category,
        searchResults: item.results
      })
    }
  }

  return { found, deferred }
}
