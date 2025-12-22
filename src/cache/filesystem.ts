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
 * ./chat-to-map/cache/requests/
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

  async setPrompt(hash: string, prompt: string): Promise<void> {
    const jsonPath = this.getCachePath(hash)
    const promptPath = jsonPath.replace(/\.json$/, '.prompt.txt')

    // Ensure directory exists
    const dir = dirname(promptPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(promptPath, prompt)
  }

  /**
   * Get the file path for a cache entry.
   * If key contains '/', use as subdirectory. Otherwise use first 2 chars as prefix.
   */
  private getCachePath(key: string): string {
    if (key.includes('/')) {
      // Key has explicit path (e.g., 'web/example_com_abc123')
      return join(this.cacheDir, 'requests', `${key}.json`)
    }
    // Use first 2 chars as subdirectory prefix
    const prefix = key.slice(0, 2)
    return join(this.cacheDir, 'requests', prefix, `${key}.json`)
  }

  /**
   * Clear all cached entries (for testing or manual cleanup)
   */
  async clear(): Promise<void> {
    const requestsDir = join(this.cacheDir, 'requests')
    if (existsSync(requestsDir)) {
      const { rmSync } = await import('node:fs')
      rmSync(requestsDir, { recursive: true, force: true })
    }
  }
}
