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
  | 'media'
  | 'web_series'
  | 'video_game'
  | 'physical_game'
  | 'game'
  | 'book'
  | 'comic'
  | 'theatre'
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
  'media',
  'web_series',
  'video_game',
  'physical_game',
  'game',
  'book',
  'comic',
  'theatre',
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
 * SINGLE SOURCE OF TRUTH: wikidata-ids.json
 *
 * All external ID definitions (Wikidata properties, URL templates) are in wikidata-ids.json.
 * This file is read by TypeScript, Rust (wikidata-search), and SaaS.
 */
import externalIdsJson from './wikidata-ids.json'

/** Build lookup maps from JSON */
const externalIdEntries = externalIdsJson.externalIds as Array<{
  name: ExternalIdType
  wikidataProperty: string
  urlTemplate: string | null
}>

/** Wikidata property IDs (e.g., imdb -> P345) */
export const WIKIDATA_PROPERTY_IDS: Record<ExternalIdType, string> = Object.fromEntries(
  externalIdEntries.map((e) => [e.name, e.wikidataProperty])
) as Record<ExternalIdType, string>

/** URL templates for constructing canonical URLs from external IDs */
export const EXTERNAL_ID_URL_TEMPLATES: Partial<Record<ExternalIdType, string>> =
  Object.fromEntries(
    externalIdEntries.filter((e) => e.urlTemplate !== null).map((e) => [e.name, e.urlTemplate])
  ) as Partial<Record<ExternalIdType, string>>

/** Priority order for selecting the best URL for link previews */
export const LINK_PREVIEW_PRIORITY: ExternalIdType[] =
  externalIdsJson.linkPreviewPriority as ExternalIdType[]

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
 * External IDs from Wikidata for building canonical URLs.
 */
export interface WikidataExternalIds {
  /** IMDb ID (e.g., "tt1234567") */
  imdbId?: string | undefined
  /** Steam application ID (e.g., "1234567") */
  steamId?: string | undefined
  /** BoardGameGeek ID (e.g., "12345") */
  bggId?: string | undefined
  /** Spotify artist ID */
  spotifyArtistId?: string | undefined
  /** Spotify album ID */
  spotifyAlbumId?: string | undefined
  /** MusicBrainz release group ID */
  musicbrainzReleaseGroupId?: string | undefined
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
  /** External IDs for building canonical URLs */
  externalIds?: WikidataExternalIds | undefined
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
 * Single source of truth: wikidata-ids.json
 */
export const WIKIDATA_TYPE_QIDS: Partial<Record<EntityType, string[]>> = Object.fromEntries(
  Object.entries(externalIdsJson.entityTypeRoots as Record<string, number[]>).map(([cat, qids]) => [
    cat,
    qids.map((q) => `Q${q}`)
  ])
) as Partial<Record<EntityType, string[]>>

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
  media: [
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
  game: [
    ['store.steampowered.com', 'steam'],
    ['boardgamegeek.com', 'bgg'],
    ['igdb.com', 'igdb'],
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
