/**
 * Media Index Client
 *
 * Fetches and queries the ChatToMap media library index.
 * Supports both CDN (https://media.chattomap.com) and local filesystem.
 *
 * The index contains:
 * - objects: Pre-curated images for common activities/objects
 * - categories: Category → object mappings for fallback
 * - synonyms: Object synonyms + action verb mappings + regional overrides
 */

import { gunzipSync } from 'node:zlib'
import { httpFetch } from '../http'

/** CDN base URL for media library */
export const MEDIA_CDN_URL = 'https://media.chattomap.com/images'

/** Available image sizes in the media library */
export const IMAGE_SIZES = [1400, 700, 400, 128] as const
export type ImageSize = (typeof IMAGE_SIZES)[number]

/** Entity types in the media library */
type MediaEntityType = 'objects' | 'categories' | 'countries' | 'regions' | 'cities' | 'venues'

/**
 * Media index structure (matches index.json v4 from media_library).
 *
 * Entry values can be:
 * - Hash (64 hex chars): Direct image in that folder
 * - Reference ($type/item/hash): Image from another folder
 */
export interface MediaIndex {
  readonly version: number
  readonly generated: string
  readonly base_url: string
  readonly sizes: readonly number[]
  /** Object images (swimming, restaurant, etc.) - values are hashes or references */
  readonly objects: Readonly<Record<string, readonly string[]>>
  /** Category images (food, nature, etc.) - values are hashes or references */
  readonly categories: Readonly<Record<string, readonly string[]>>
  /** Country images (France, Japan, etc.) - values are hashes or references */
  readonly countries: Readonly<Record<string, readonly string[]>>
  /** Region images (California, Queensland, etc.) - future */
  readonly regions: Readonly<Record<string, readonly string[]>>
  /** City images (Paris, Tokyo, etc.) - future */
  readonly cities: Readonly<Record<string, readonly string[]>>
  /** Venue images (Eiffel Tower, etc.) - future */
  readonly venues: Readonly<Record<string, readonly string[]>>
  readonly synonyms: {
    readonly objects?: Readonly<Record<string, readonly string[]>>
    readonly object_actions?: Readonly<Record<string, readonly string[]>>
    readonly regional?: Readonly<
      Record<
        string,
        {
          readonly objects?: Readonly<Record<string, string>>
        }
      >
    >
  }
}

/**
 * Resolved image location after parsing entry (hash or reference).
 */
interface ResolvedImageLocation {
  /** Entity type (objects, categories, countries, etc.) */
  readonly type: MediaEntityType
  /** Item name within the type */
  readonly item: string
  /** Image hash (without extension) */
  readonly hash: string
}

/**
 * Result of a media library lookup.
 */
export interface MediaLibraryMatch {
  /** Entity type that matched */
  readonly entityType: MediaEntityType
  /** Item name within the type */
  readonly itemName: string
  /** Resolved image location (may differ from match if reference) */
  readonly resolved: ResolvedImageLocation
  /** How the match was found */
  readonly matchType: 'object' | 'synonym' | 'action' | 'category' | 'country'
}

/**
 * Options for media index operations.
 */
export interface MediaIndexOptions {
  /**
   * Local filesystem path to media library images directory.
   * If provided, images are read from disk instead of CDN.
   */
  readonly localPath?: string | undefined

  /**
   * Country code for regional synonym overrides (e.g., "US", "AU", "NZ").
   */
  readonly countryCode?: string | undefined
}

/**
 * Load media index from CDN or local filesystem.
 */
export async function loadMediaIndex(options?: MediaIndexOptions): Promise<MediaIndex | null> {
  const { localPath } = options ?? {}

  try {
    if (localPath) {
      return await loadLocalIndex(localPath)
    }
    return await loadCdnIndex()
  } catch (error) {
    console.warn('Failed to load media index:', error)
    return null
  }
}

/**
 * Load index from CDN (gzipped).
 */
async function loadCdnIndex(): Promise<MediaIndex> {
  const response = await httpFetch(`${MEDIA_CDN_URL}/index.json.gz`)
  if (!response.ok) {
    throw new Error(`Failed to fetch media index: ${response.status}`)
  }

  const compressed = new Uint8Array(await response.arrayBuffer())
  const decompressed = gunzipSync(compressed)
  return JSON.parse(decompressed.toString()) as MediaIndex
}

/**
 * Load index from local filesystem.
 */
async function loadLocalIndex(basePath: string): Promise<MediaIndex> {
  const { readFileSync, existsSync } = await import('node:fs')
  const { join } = await import('node:path')

  // Try gzipped first, then plain JSON
  const gzPath = join(basePath, 'index.json.gz')
  const jsonPath = join(basePath, 'index.json')

  if (existsSync(gzPath)) {
    const buffer = readFileSync(gzPath)
    const compressed = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const decompressed = gunzipSync(compressed)
    return JSON.parse(decompressed.toString()) as MediaIndex
  }

  if (existsSync(jsonPath)) {
    const content = readFileSync(jsonPath, 'utf-8')
    return JSON.parse(content) as MediaIndex
  }

  throw new Error(`Media index not found at ${basePath}`)
}

/**
 * Parse an entry (hash or reference) into a resolved image location.
 *
 * Entry formats:
 * - Hash (64 hex chars): Direct image in the source folder
 * - Reference ($type/item/hash): Image from another folder
 *
 * @param entry - The entry string from the index
 * @param sourceType - The entity type where this entry was found
 * @param sourceItem - The item name where this entry was found
 * @returns Resolved image location
 */
export function resolveEntry(
  entry: string,
  sourceType: MediaEntityType,
  sourceItem: string
): ResolvedImageLocation {
  if (entry.startsWith('$')) {
    // Reference: $objects/cooking class/abc123...
    const ref = entry.slice(1) // Remove $
    const parts = ref.split('/')
    const hash = parts.pop() ?? ''
    const item = parts.pop() ?? ''
    const type = parts.join('/') as MediaEntityType
    return { type, item, hash }
  }
  // Direct hash
  return { type: sourceType, item: sourceItem, hash: entry }
}

/**
 * Find an image for an object name (direct match or synonym).
 *
 * @param objectName - The object to search for (e.g., "swimming", "sushi")
 * @param index - The loaded media index
 * @param options - Country code for regional overrides
 * @returns Match info or null if no match found
 */
export function findObjectImage(
  objectName: string,
  index: MediaIndex,
  options?: MediaIndexOptions
): MediaLibraryMatch | null {
  const normalized = normalizeObjectName(objectName)
  const { countryCode } = options ?? {}

  // Apply regional override if applicable
  const resolvedName = applyRegionalOverride(normalized, index, countryCode) ?? normalized

  // Direct object match
  const entries = index.objects[resolvedName]
  if (entries && entries.length > 0) {
    const entry = pickRandom(entries)
    return {
      entityType: 'objects',
      itemName: resolvedName,
      resolved: resolveEntry(entry, 'objects', resolvedName),
      matchType: 'object'
    }
  }

  // Synonym match
  if (index.synonyms.objects) {
    for (const [folder, synonyms] of Object.entries(index.synonyms.objects)) {
      if (synonyms.includes(normalized)) {
        const folderEntries = index.objects[folder]
        if (folderEntries && folderEntries.length > 0) {
          const entry = pickRandom(folderEntries)
          return {
            entityType: 'objects',
            itemName: folder,
            resolved: resolveEntry(entry, 'objects', folder),
            matchType: 'synonym'
          }
        }
      }
    }
  }

  return null
}

/**
 * Find an image for an action verb (fallback when no object match).
 *
 * Only matches unambiguous action verbs that map to generic photos.
 * Example: "swim" → swimming images work for any pool/ocean/lake.
 *
 * @param action - The action verb (e.g., "swim", "hike", "bike")
 * @param index - The loaded media index
 * @returns Match info or null if no match found
 */
export function findActionFallbackImage(
  action: string,
  index: MediaIndex
): MediaLibraryMatch | null {
  if (!index.synonyms.object_actions) return null

  const normalized = action.toLowerCase().trim()

  for (const [folder, verbs] of Object.entries(index.synonyms.object_actions)) {
    if (verbs.includes(normalized)) {
      const entries = index.objects[folder]
      if (entries && entries.length > 0) {
        const entry = pickRandom(entries)
        return {
          entityType: 'objects',
          itemName: folder,
          resolved: resolveEntry(entry, 'objects', folder),
          matchType: 'action'
        }
      }
    }
  }

  return null
}

/**
 * Find a fallback image for a category.
 *
 * Categories have their own images (direct or references to objects).
 *
 * @param category - The category (e.g., "fitness", "food", "nature")
 * @param index - The loaded media index
 * @returns Match info or null if no match found
 */
export function findCategoryFallbackImage(
  category: string,
  index: MediaIndex
): MediaLibraryMatch | null {
  const entries = index.categories[category]
  if (!entries || entries.length === 0) return null

  const entry = pickRandom(entries)
  return {
    entityType: 'categories',
    itemName: category,
    resolved: resolveEntry(entry, 'categories', category),
    matchType: 'category'
  }
}

/**
 * Normalize text for fuzzy matching: lowercase + remove diacritics.
 * "Côte d'Ivoire" → "cote d'ivoire"
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * Find an image for a country.
 *
 * Use for activities like "visit France" or "go to Japan" where the activity
 * is just visiting a country we have images for.
 *
 * Matching is case-insensitive and ignores diacritics:
 * - "france" matches "France"
 * - "cote d'ivoire" matches "Côte d'Ivoire"
 *
 * @param country - The country name (e.g., "France", "New Zealand")
 * @param index - The loaded media index
 * @returns Match info or null if no match found
 */
export function findCountryImage(country: string, index: MediaIndex): MediaLibraryMatch | null {
  // Try exact match first
  let entries = index.countries[country]
  let matchedName = country

  // Try normalized match (case-insensitive + no diacritics)
  if (!entries) {
    const normalizedInput = normalizeForMatching(country)
    for (const [name, countryEntries] of Object.entries(index.countries)) {
      if (normalizeForMatching(name) === normalizedInput) {
        entries = countryEntries
        matchedName = name
        break
      }
    }
  }

  if (!entries || entries.length === 0) return null

  const entry = pickRandom(entries)
  return {
    entityType: 'countries',
    itemName: matchedName,
    resolved: resolveEntry(entry, 'countries', matchedName),
    matchType: 'country'
  }
}

/**
 * Build the full URL for a media library image.
 *
 * Uses the resolved location from the match (handles references automatically).
 *
 * @param match - The match result from find* functions
 * @param size - Desired image size (1400, 700, 400, or 128)
 * @param options - Local path or CDN URL
 * @returns Full URL to the image
 */
export function buildImageUrl(
  match: MediaLibraryMatch,
  size: ImageSize = 700,
  options?: MediaIndexOptions
): string {
  const { localPath } = options ?? {}
  const { type, item, hash } = match.resolved
  const filename = `${hash}-${size}.jpg`

  if (localPath) {
    return `file://${localPath}/${type}/${item}/${filename}`
  }

  return `${MEDIA_CDN_URL}/${type}/${encodeURIComponent(item)}/${filename}`
}

/**
 * Apply regional synonym override.
 *
 * Example: In US, "football" → "american football"
 */
function applyRegionalOverride(
  objectName: string,
  index: MediaIndex,
  countryCode?: string
): string | null {
  if (!countryCode || !index.synonyms.regional) return null

  const regionOverrides = index.synonyms.regional[countryCode]
  if (!regionOverrides?.objects) return null

  return regionOverrides.objects[objectName] ?? null
}

/**
 * Normalize object name for matching.
 */
function normalizeObjectName(name: string): string {
  return name.toLowerCase().trim().replace(/_/g, ' ')
}

/**
 * Pick a random element from an array.
 */
function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T
}
