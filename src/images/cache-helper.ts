/**
 * Image Cache Helper
 *
 * Shared caching utilities for image fetchers.
 */

import type { ResponseCache } from '../caching/types'

/**
 * Cache a successful result.
 */
export async function cacheResult<T>(cache: ResponseCache, key: string, data: T): Promise<void> {
  await cache.set(key, { data, cachedAt: Date.now() })
}

/**
 * Cache a null/failed result.
 */
export async function cacheNull(cache: ResponseCache, key: string): Promise<void> {
  await cache.set(key, { data: null, cachedAt: Date.now() })
}

/**
 * Get cached result or null if not found.
 */
export async function getCached<T>(
  cache: ResponseCache,
  key: string
): Promise<{ hit: true; data: T | null } | { hit: false }> {
  const cached = await cache.get<T | null>(key)
  if (cached !== null) {
    return { hit: true, data: cached.data }
  }
  return { hit: false }
}
