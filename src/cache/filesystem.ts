/**
 * Filesystem-based Response Cache for CLI
 *
 * Stores cached API responses as JSON files organized by hash prefix.
 * TTL is checked on read - expired entries are deleted automatically.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { CachedResponse, ResponseCache } from './types'

interface CacheEntry<T> {
  response: CachedResponse<T>
  ttlMs: number
  cachedAt: number
}

/**
 * Filesystem-based cache implementation for CLI usage.
 *
 * Directory structure:
 * ```
 * ./chat-to-map/cache/apis/
 * ├── ab/
 * │   └── abcd1234...json
 * ├── cd/
 * │   └── cdef5678...json
 * ```
 *
 * Uses first 2 chars of hash as subdirectory to avoid too many files in one dir.
 */
export class FilesystemCache implements ResponseCache {
  constructor(private readonly cacheDir: string) {}

  async get<T = unknown>(hash: string): Promise<CachedResponse<T> | null> {
    const path = this.getCachePath(hash)

    if (!existsSync(path)) {
      return null
    }

    try {
      const raw = readFileSync(path, 'utf-8')
      const entry = JSON.parse(raw) as CacheEntry<T>

      // Check if expired
      const age = Date.now() - entry.cachedAt
      if (age > entry.ttlMs) {
        // Clean up expired entry
        try {
          unlinkSync(path)
        } catch {
          // Ignore deletion errors
        }
        return null
      }

      return entry.response
    } catch {
      // Invalid cache file - delete it
      try {
        unlinkSync(path)
      } catch {
        // Ignore deletion errors
      }
      return null
    }
  }

  async set<T = unknown>(
    hash: string,
    response: CachedResponse<T>,
    ttlSeconds: number
  ): Promise<void> {
    const path = this.getCachePath(hash)

    // Ensure directory exists
    const dir = dirname(path)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const entry: CacheEntry<T> = {
      response,
      ttlMs: ttlSeconds * 1000,
      cachedAt: Date.now()
    }

    writeFileSync(path, JSON.stringify(entry, null, 2))
  }

  /**
   * Get the file path for a cache entry.
   * Uses first 2 chars of hash as subdirectory.
   */
  private getCachePath(hash: string): string {
    const prefix = hash.slice(0, 2)
    return join(this.cacheDir, 'apis', prefix, `${hash}.json`)
  }

  /**
   * Clear all cached entries (for testing or manual cleanup)
   */
  async clear(): Promise<void> {
    const apisDir = join(this.cacheDir, 'apis')
    if (existsSync(apisDir)) {
      const { rmSync } = await import('node:fs')
      rmSync(apisDir, { recursive: true, force: true })
    }
  }
}
