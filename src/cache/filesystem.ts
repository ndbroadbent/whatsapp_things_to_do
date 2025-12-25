/**
 * Filesystem-based Response Cache for CLI
 *
 * Stores cached API responses as JSON files organized by hash prefix.
 * Cache entries never expire - they're kept forever.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { CachedResponse, ResponseCache } from './types'

/**
 * Throws if tests try to access the user's real cache directory.
 * Tests must use isolated temp directories.
 */
function guardAgainstUserCache(cacheDir: string): void {
  const isTest = process.env['VITEST'] === 'true' || process.env['NODE_ENV'] === 'test'
  if (!isTest) return

  const realCacheDir = join(homedir(), '.cache', 'chat-to-map')
  if (cacheDir.startsWith(realCacheDir)) {
    throw new Error(
      `TEST ERROR: Attempted to access user's real cache directory!\n` +
        `  Cache dir: ${cacheDir}\n` +
        `  Tests must use isolated temp directories, not ~/.cache/chat-to-map/`
    )
  }
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
  constructor(private readonly cacheDir: string) {
    guardAgainstUserCache(cacheDir)
  }

  async get<T = unknown>(hash: string): Promise<CachedResponse<T> | null> {
    const path = this.getCachePath(hash)

    if (!existsSync(path)) {
      return null
    }

    try {
      const raw = readFileSync(path, 'utf-8')
      const entry = JSON.parse(raw) as { response: CachedResponse<T> }
      return entry.response
    } catch {
      return null
    }
  }

  async set<T = unknown>(hash: string, response: CachedResponse<T>): Promise<void> {
    const path = this.getCachePath(hash)

    // Ensure directory exists
    const dir = dirname(path)
    if (dir.startsWith('--')) {
      throw new Error(`FilesystemCache.set called with flag-like dir: "${dir}"`)
    }
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    const entry = { response, cachedAt: Date.now() }
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
