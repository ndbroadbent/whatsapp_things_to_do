/**
 * Cache Key Generation
 *
 * Generates deterministic SHA256 hash keys for API request caching.
 */

import { createHash } from 'node:crypto'
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
 *   model: 'text-embedding-3-small',
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
 * Generate cache key for embedding requests
 */
export function generateEmbeddingCacheKey(model: string, inputs: readonly string[]): string {
  return generateCacheKey({
    service: 'openai',
    model,
    payload: { inputs: [...inputs].sort() }
  })
}

/**
 * Generate cache key for classification requests
 */
export function generateClassifierCacheKey(
  provider: string,
  model: string,
  messages: readonly { readonly content: string; readonly messageId: number }[]
): string {
  return generateCacheKey({
    service: provider,
    model,
    payload: {
      messages: messages.map((m) => ({
        id: m.messageId,
        content: m.content
      }))
    }
  })
}

/**
 * Generate cache key for geocoding requests
 */
export function generateGeocodeCacheKey(location: string, regionBias?: string): string {
  return generateCacheKey({
    service: 'google',
    model: 'geocoding',
    payload: { location, regionBias }
  })
}
