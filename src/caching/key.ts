/**
 * Cache Key Generation
 *
 * Generates deterministic SHA256 hash keys for API request caching.
 */

import { createHash } from 'node:crypto'
import { getPromptSignature } from '../classifier/prompt'
import type { CacheKeyComponents } from './types'

/**
 * Sort object keys recursively for deterministic JSON stringification
 */
function sortKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys)
  }

  const sorted: Record<string, unknown> = {}
  const keys = Object.keys(obj as Record<string, unknown>).sort()
  for (const key of keys) {
    sorted[key] = sortKeys((obj as Record<string, unknown>)[key])
  }
  return sorted
}

/**
 * Generate a deterministic cache key from request components.
 *
 * The key is a SHA256 hash of: service:model:normalized_payload
 *
 * @example
 * ```ts
 * const key = generateCacheKey({
 *   service: 'openai',
 *   model: 'text-embedding-3-large',
 *   payload: { input: ['hello', 'world'] }
 * })
 * // Returns: '3a7bd3e2...' (64 char hex string)
 * ```
 */
export function generateCacheKey(components: CacheKeyComponents): string {
  const { service, model, payload } = components
  const normalized = JSON.stringify(sortKeys(payload))
  const input = `${service}:${model}:${normalized}`

  return createHash('sha256').update(input).digest('hex')
}

/**
 * Generate cache key for embedding requests.
 * Path: ai/openai/<model>/<hash>.json
 */
export function generateEmbeddingCacheKey(model: string, inputs: readonly string[]): string {
  const hash = generateCacheKey({
    service: 'openai',
    model,
    payload: { inputs: [...inputs].sort() }
  })
  return `ai/openai/${model}/${hash}`
}

/**
 * Generate cache key for classification requests.
 * Path: ai/<provider>/<model>/<promptSig>/<hash>.json
 *
 * Includes prompt signature so cache is invalidated when prompt.ts changes.
 */
export function generateClassifierCacheKey(
  provider: string,
  model: string,
  messages: readonly { readonly content: string; readonly messageId: number }[]
): string {
  const promptSig = getPromptSignature()
  const hash = generateCacheKey({
    service: provider,
    model,
    payload: {
      messages: messages.map((m) => ({
        id: m.messageId,
        content: m.content
      }))
    }
  })
  return `ai/${provider}/${model}/${promptSig}/${hash}`
}

/**
 * Generate cache key for geocoding requests.
 * Path: geo/google/<hash>.json
 */
export function generateGeocodeCacheKey(location: string, regionBias?: string): string {
  const hash = generateCacheKey({
    service: 'google',
    model: 'geocoding',
    payload: { location, regionBias }
  })
  return `geo/google/${hash}`
}

/**
 * Generate cache key for URL-based requests (scraping, fetching).
 * Creates readable filename: sanitized URL + short hash suffix.
 * Use with subdirectory 'web/' in cache path.
 */
export function generateUrlCacheKey(url: string): string {
  // Sanitize URL for filename: replace invalid chars with _, collapse multiple _
  const sanitized = url
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80)
  // Add short hash of full URL for uniqueness
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 8)
  return `web/${sanitized}_${hash}`
}

/**
 * Generate cache key for image requests.
 * Creates readable filename: sanitized query + short hash suffix.
 * Path: images/<source>/<sanitized_query>-<hash>.json
 *
 * @example
 * ```ts
 * generateImageCacheKey('pixabay', 'hiking mountains')
 * // Returns: 'images/pixabay/hiking_mountains-a1b2c3d4'
 * ```
 */
export function generateImageCacheKey(source: string, query: string): string {
  const sanitized = query
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24)
  const hash = createHash('sha256').update(query.toLowerCase()).digest('hex').slice(0, 8)
  return `images/${source}/${sanitized}-${hash}`
}

/**
 * Generate filename for cached image files (originals and thumbnails).
 * Creates readable filename: first 36 chars of sanitized URL (without protocol) + 8 char hash.
 *
 * @example
 * ```ts
 * generateImageFilename('https://pixabay.com/photos/mountain-1234/')
 * // Returns: 'pixabay_com_photos_mountain-1234-a1b2c3d4.jpg'
 * ```
 */
export function generateImageFilename(url: string): string {
  const sanitized = url
    .replace(/^https?:\/\//, '') // Remove http:// or https://
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 36)
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 8)
  return `${sanitized}-${hash}.jpg`
}
