/**
 * Fixture-based Response Cache for Tests
 *
 * Stores all cached API responses in a single .json.gz file.
 * Designed for test fixtures that can be shared across multiple tests.
 *
 * Features:
 * - Single compressed file for all cache entries
 * - Load once at test start, save at end
 * - Additive: new entries are added to existing fixture
 * - No TTL: fixtures never expire
 * - Thread-safe: can be shared across tests
 *
 * Usage:
 * ```ts
 * const cache = new FixtureCache('tests/fixtures/embeddings.json.gz')
 * await cache.load()
 *
 * // Use with any ResponseCache-compatible function
 * const result = await messageEmbeddings(messages, config, cache)
 *
 * // Save after tests (adds new entries to fixture)
 * await cache.save()
 * ```
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type { CachedResponse, ResponseCache } from '../caching/types'

interface FixtureEntry<T = unknown> {
  response: CachedResponse<T>
}

interface FixtureData {
  version: 1
  createdAt: string
  updatedAt: string
  entries: Record<string, FixtureEntry>
}

/**
 * Fixture-based cache that stores all entries in a single .json.gz file.
 *
 * - Implements ResponseCache for use with embeddings, classifier, geocoder
 * - Ignores TTL (fixtures never expire)
 * - Additive: loads existing, adds new entries, saves back
 */
export class FixtureCache implements ResponseCache {
  private entries: Map<string, FixtureEntry> = new Map()
  private dirty = false
  private loaded = false
  private createdAt: string = new Date().toISOString()

  constructor(private readonly fixturePath: string) {}

  /**
   * Load fixture from disk. Call before using the cache.
   * If file doesn't exist, starts with empty cache.
   */
  async load(): Promise<void> {
    if (this.loaded) return

    if (existsSync(this.fixturePath)) {
      try {
        const compressed = readFileSync(this.fixturePath)
        const json = gunzipSync(new Uint8Array(compressed)).toString('utf-8')
        const data = JSON.parse(json) as FixtureData

        if (data.version !== 1) {
          throw new Error(`Unsupported fixture version: ${data.version}`)
        }

        this.createdAt = data.createdAt
        for (const [hash, entry] of Object.entries(data.entries)) {
          this.entries.set(hash, entry)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to load fixture ${this.fixturePath}: ${message}`)
      }
    }

    this.loaded = true
  }

  /**
   * Save fixture to disk. Call after tests complete.
   * Only writes if new entries were added.
   */
  async save(): Promise<void> {
    if (!this.dirty) return

    const data: FixtureData = {
      version: 1,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      entries: Object.fromEntries(this.entries)
    }

    const json = JSON.stringify(data, null, 2)
    const compressed = gzipSync(json)

    // Ensure directory exists
    const dir = dirname(this.fixturePath)
    if (!existsSync(dir)) {
      const { mkdirSync } = await import('node:fs')
      mkdirSync(dir, { recursive: true })
    }

    writeFileSync(this.fixturePath, new Uint8Array(compressed))
    this.dirty = false
  }

  /**
   * Get cached response by hash.
   * Returns null if not found (triggers API call in production code).
   */
  async get<T = unknown>(hash: string): Promise<CachedResponse<T> | null> {
    if (!this.loaded) {
      await this.load()
    }

    const entry = this.entries.get(hash)
    if (!entry) return null

    return entry.response as CachedResponse<T>
  }

  /**
   * Store response in cache.
   */
  async set<T = unknown>(hash: string, response: CachedResponse<T>): Promise<void> {
    if (!this.loaded) {
      await this.load()
    }

    // Only mark dirty if this is a new entry
    if (!this.entries.has(hash)) {
      this.dirty = true
    }

    this.entries.set(hash, { response })
  }

  /**
   * Check if a key exists in the cache.
   */
  has(hash: string): boolean {
    return this.entries.has(hash)
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.entries.size
  }

  /**
   * Check if there are unsaved changes.
   */
  get isDirty(): boolean {
    return this.dirty
  }

  /**
   * Get all cached hashes (for debugging/inspection).
   */
  keys(): string[] {
    return Array.from(this.entries.keys())
  }

  /**
   * Clear all entries (for testing).
   */
  clear(): void {
    this.entries.clear()
    this.dirty = true
  }
}
