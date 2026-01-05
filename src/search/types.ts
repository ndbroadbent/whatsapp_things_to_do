/**
 * Entity Resolution Types
 *
 * Types for the 5-stage entity resolution pipeline that maps
 * entity names (movies, books, games, etc.) to canonical URLs.
 */

import type { ResponseCache } from '../caching/types'

/**
 * Entity type categories for resolution.
 * Matches the 12 categories defined in SEARCH_INDEX.md.
 */
export type EntityType =
  | 'movie'
  | 'tv_show'
  | 'web_series'
  | 'video_game'
  | 'physical_game'
  | 'book'
  | 'comic'
  | 'play'
  | 'album'
  | 'song'
  | 'podcast'
  | 'artist'

/**
 * Valid link types array (source of truth for classifier prompt).
 * Must match EntityType union above.
 */
export const VALID_LINK_TYPES: readonly EntityType[] = [
  'movie',
  'tv_show',
  'web_series',
  'video_game',
  'physical_game',
  'book',
  'comic',
  'play',
  'album',
  'song',
  'podcast',
  'artist'
] as const

/**
 * External ID types for entity identification.
 */
export type ExternalIdType =
  | 'imdb'
  | 'tmdb_movie'
  | 'tmdb_tv'
  | 'letterboxd'
  | 'netflix'
  | 'bgg'
  | 'steam'
  | 'igdb'
  | 'gog'
  | 'musicbrainz_artist'
  | 'musicbrainz_release_group'
  | 'musicbrainz_release'
  | 'spotify_artist'
  | 'spotify_album'
  | 'spotify_show'
  | 'discogs_artist'
  | 'discogs_release'
  | 'goodreads'
  | 'openlibrary'
  | 'google_books'
  | 'isbn13'
  | 'isbn10'
  | 'apple_podcasts'
  | 'nintendo_na'
  | 'nintendo_eu'
  | 'playstation_na'
  | 'playstation_eu'
  | 'xbox'
  | 'official_website'

/**
 * Source of the resolved entity.
 */
export type EntitySource = 'wikidata' | 'openlibrary' | 'google' | 'heuristic' | 'ai'

/**
 * A resolved entity with canonical URL and metadata.
 */
export interface ResolvedEntity {
  /** Unique identifier (Wikidata QID or Open Library ID) */
  id: string
  /** Source of the resolution */
  source: EntitySource
  /** Entity title/name */
  title: string
  /** Canonical URL (IMDb, Goodreads, etc.) */
  url: string
  /** Entity type */
  type: EntityType
  /** Year of release/publication */
  year?: number | undefined
  /** Short description */
  description?: string | undefined
  /** Image URL (cover, poster, etc.) */
  imageUrl?: string | undefined
  /** Wikipedia URL if available */
  wikipediaUrl?: string | undefined
  /** External IDs (IMDb ID, ISBN, etc.) */
  externalIds: Partial<Record<ExternalIdType, string>>
}

/**
 * Configuration for Google Search API.
 */
export interface GoogleSearchConfig {
  /** Google Programmable Search API key */
  apiKey: string
  /** Custom search engine ID */
  cx: string
}

/**
 * Configuration for AI classification stage.
 */
export interface AIClassificationConfig {
  /** Google AI API key (for Gemini) */
  apiKey: string
  /** Model to use (default: gemini-3-flash-preview) */
  model?: string | undefined
}

/**
 * Configuration for entity resolution.
 */
export interface ResolverConfig {
  /** Enable Wikidata API fallback (default: true) */
  wikidata?: boolean | undefined
  /** Enable Open Library API for books (default: true) */
  openlibrary?: boolean | undefined
  /** Google Search API configuration */
  googleSearch?: GoogleSearchConfig | undefined
  /** AI classification configuration */
  aiClassification?: AIClassificationConfig | undefined
  /** Response cache for API calls */
  cache?: ResponseCache | undefined
  /** User agent for API requests */
  userAgent?: string | undefined
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number | undefined
}

/**
 * Result from Wikidata API search.
 */
export interface WikidataResult {
  /** Wikidata QID (e.g., "Q123456") */
  qid: string
  /** Entity label */
  label: string
  /** Entity description */
  description?: string | undefined
  /** Image URL from Wikidata */
  imageUrl?: string | undefined
  /** Wikipedia URL */
  wikipediaUrl?: string | undefined
}

/**
 * Result from Open Library API search.
 */
export interface OpenLibraryResult {
  /** Open Library Work ID (e.g., "OL123W") */
  workId: string
  /** Open Library Edition ID (e.g., "OL456M") */
  editionId?: string | undefined
  /** Book title */
  title: string
  /** Author name(s) */
  author?: string | undefined
  /** Cover image URL */
  coverUrl?: string | undefined
  /** Work URL on Open Library */
  workUrl: string
  /** Edition URL on Open Library */
  editionUrl?: string | undefined
  /** Physical format (e.g., "Hardcover") */
  format?: string | undefined
  /** First publish year */
  firstPublishYear?: number | undefined
}

/**
 * A single result from Google Search API.
 */
export interface GoogleSearchResult {
  /** Result title */
  title: string
  /** Result URL */
  url: string
  /** Snippet/description */
  snippet?: string | undefined
}

/**
 * Result from heuristic matching stage.
 */
export interface HeuristicMatch {
  /** Original query title */
  title: string
  /** Entity category */
  category: EntityType
  /** Matched URL */
  url: string
  /** Source name (e.g., "imdb", "goodreads") */
  source: string
  /** Matched result title */
  matchedTitle: string
}

/**
 * Item deferred to AI classification.
 */
export interface DeferredItem {
  /** Original query title */
  title: string
  /** Entity category */
  category: EntityType
  /** Search results to rank */
  searchResults: GoogleSearchResult[]
}

/**
 * Result from AI classification stage.
 */
export interface ClassificationResult {
  /** Original query title */
  title: string
  /** Entity category */
  category: EntityType
  /** Ranked URL indexes (1-indexed, best first) */
  urlIndexes: number[]
  /** Ranked URLs (resolved from indexes) */
  rankedUrls: string[]
  /** AI explanation */
  explanation: string
}

/**
 * Wikidata type QIDs for each entity category.
 * Used in SPARQL queries to filter by type.
 */
export const WIKIDATA_TYPE_QIDS: Partial<Record<EntityType, string[]>> = {
  // Film types
  movie: ['Q11424', 'Q506240', 'Q24862', 'Q93204', 'Q202866'],
  // TV types
  tv_show: ['Q5398426', 'Q1259759', 'Q3464665', 'Q526877', 'Q21191270'],
  // Book types
  book: ['Q571', 'Q7725634', 'Q8261', 'Q49084', 'Q277759', 'Q747381'],
  // Video game types
  video_game: ['Q7889'],
  // Board game types
  physical_game: ['Q131436', 'Q11410', 'Q142714'],
  // Album types
  album: ['Q482994', 'Q169930'],
  // Song types
  song: ['Q7366', 'Q134556']
}

/**
 * Preferred sources by category for heuristic matching.
 * Order matters - first match from higher-priority source wins.
 */
export const PREFERRED_SOURCES: Partial<Record<EntityType, [string, string][]>> = {
  movie: [
    ['imdb.com', 'imdb'],
    ['wikipedia.org', 'wikipedia']
  ],
  tv_show: [
    ['imdb.com', 'imdb'],
    ['wikipedia.org', 'wikipedia']
  ],
  book: [
    ['goodreads.com', 'goodreads'],
    ['amazon.com', 'amazon'],
    ['amazon.co.uk', 'amazon'],
    ['amazon.co.nz', 'amazon']
  ],
  video_game: [
    ['store.steampowered.com', 'steam'],
    ['igdb.com', 'igdb'],
    ['wikipedia.org', 'wikipedia']
  ],
  physical_game: [
    ['boardgamegeek.com', 'bgg'],
    ['wikipedia.org', 'wikipedia']
  ],
  album: [
    ['open.spotify.com', 'spotify'],
    ['musicbrainz.org', 'musicbrainz'],
    ['wikipedia.org', 'wikipedia']
  ],
  song: [
    ['open.spotify.com', 'spotify'],
    ['musicbrainz.org', 'musicbrainz']
  ]
}

/**
 * URL templates for constructing canonical URLs from external IDs.
 */
export const EXTERNAL_ID_URL_TEMPLATES: Partial<Record<ExternalIdType, string>> = {
  imdb: 'https://www.imdb.com/title/{id}/',
  tmdb_movie: 'https://www.themoviedb.org/movie/{id}',
  tmdb_tv: 'https://www.themoviedb.org/tv/{id}',
  letterboxd: 'https://letterboxd.com/film/{id}/',
  bgg: 'https://boardgamegeek.com/boardgame/{id}',
  steam: 'https://store.steampowered.com/app/{id}',
  spotify_artist: 'https://open.spotify.com/artist/{id}',
  spotify_album: 'https://open.spotify.com/album/{id}',
  goodreads: 'https://www.goodreads.com/book/show/{id}',
  openlibrary: 'https://openlibrary.org/works/{id}',
  apple_podcasts: 'https://podcasts.apple.com/podcast/id{id}'
}

/**
 * Filler words to remove when comparing titles.
 */
export const FILLER_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'is',
  'by'
])

/**
 * Default user agent for API requests.
 */
export const DEFAULT_USER_AGENT = 'ChatToMapBot/1.0 (https://chattomap.com; contact@chattomap.com)'

/**
 * Default timeout for API requests in milliseconds.
 */
export const DEFAULT_TIMEOUT = 30000
