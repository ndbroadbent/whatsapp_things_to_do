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
export const IMAGE_SIZES = [700, 400, 128] as const
export type ImageSize = (typeof IMAGE_SIZES)[number]

/**
 * Media index structure (matches index.json from media_library).
 */
export interface MediaIndex {
  readonly version: number
  readonly generated: string
  readonly base_url: string
  readonly sizes: readonly number[]
  readonly objects: Readonly<Record<string, readonly string[]>>
  readonly categories: Readonly<Record<string, { readonly objects: readonly string[] }>>
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
 * Result of a media library lookup.
 */
export interface MediaLibraryMatch {
  /** Object folder name that matched */
  readonly objectName: string
  /** Image hash (without extension) */
  readonly imageHash: string
  /** How the match was found */
  readonly matchType: 'object' | 'synonym' | 'action' | 'category'
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
  const directHashes = index.objects[resolvedName]
  if (directHashes && directHashes.length > 0) {
    return {
      objectName: resolvedName,
      imageHash: pickRandomHash(directHashes),
      matchType: 'object'
    }
  }

  // Synonym match
  if (index.synonyms.objects) {
    for (const [folder, synonyms] of Object.entries(index.synonyms.objects)) {
      if (synonyms.includes(normalized)) {
        const hashes = index.objects[folder]
        if (hashes && hashes.length > 0) {
          return {
            objectName: folder,
            imageHash: pickRandomHash(hashes),
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
      const hashes = index.objects[folder]
      if (hashes && hashes.length > 0) {
        return {
          objectName: folder,
          imageHash: pickRandomHash(hashes),
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
 * Uses category_mappings to find representative objects for the category.
 *
 * @param category - The category (e.g., "fitness", "food", "nature")
 * @param index - The loaded media index
 * @returns Match info or null if no match found
 */
export function findCategoryFallbackImage(
  category: string,
  index: MediaIndex
): MediaLibraryMatch | null {
  const categoryMapping = index.categories[category]
  if (!categoryMapping || categoryMapping.objects.length === 0) return null

  // Pick a random object from the category's representative objects
  const objectName = pickRandom(categoryMapping.objects)
  const hashes = index.objects[objectName]

  if (hashes && hashes.length > 0) {
    return {
      objectName,
      imageHash: pickRandomHash(hashes),
      matchType: 'category'
    }
  }

  return null
}

/**
 * Build the full URL for a media library image.
 *
 * @param match - The match result from find* functions
 * @param size - Desired image size (700, 400, or 128)
 * @param options - Local path or CDN URL
 * @returns Full URL to the image
 */
export function buildImageUrl(
  match: MediaLibraryMatch,
  size: ImageSize = 700,
  options?: MediaIndexOptions
): string {
  const { localPath } = options ?? {}
  const filename = `${match.imageHash}-${size}.jpg`

  if (localPath) {
    return `file://${localPath}/objects/${match.objectName}/${filename}`
  }

  return `${MEDIA_CDN_URL}/objects/${encodeURIComponent(match.objectName)}/${filename}`
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

/**
 * Pick a random hash from an array.
 */
function pickRandomHash(hashes: readonly string[]): string {
  return pickRandom(hashes)
}
