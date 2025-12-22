/**
 * API Response Caching Types
 *
 * Pluggable caching interface for preventing duplicate API calls on retries.
 * Implementations provided by coordinators (SaaS: Cloudflare KV, CLI: Filesystem).
 */

/**
 * Cached response wrapper with metadata
 */
export interface CachedResponse<T = unknown> {
  readonly data: T
  readonly cachedAt: number
}

/**
 * Pluggable cache interface for API responses.
 *
 * Implementations:
 * - SaaS: CloudflareKVCache (encrypted, 15min TTL)
 * - CLI: FilesystemCache (local JSON files)
 */
export interface ResponseCache {
  /**
   * Get cached response by hash key
   * @param hash - SHA256 hash of the request
   * @returns Cached response or null if not found/expired
   */
  get<T = unknown>(hash: string): Promise<CachedResponse<T> | null>

  /**
   * Store response in cache
   * @param hash - SHA256 hash of the request
   * @param response - Response to cache
   * @param ttlSeconds - Time-to-live in seconds
   */
  set<T = unknown>(hash: string, response: CachedResponse<T>, ttlSeconds: number): Promise<void>

  /**
   * Store prompt text for debugging (optional).
   * Saved alongside cached response as .prompt.txt
   * @param hash - Same hash key used for set()
   * @param prompt - The prompt text to save
   */
  setPrompt?(hash: string, prompt: string): Promise<void>
}

/**
 * Cache key components for generating deterministic hash
 */
export interface CacheKeyComponents {
  /** Service name: 'openai', 'anthropic', 'google' */
  readonly service: string
  /** Model or endpoint: 'text-embedding-3-large', 'claude-3-haiku', 'geocoding' */
  readonly model: string
  /** Request payload (will be JSON stringified and sorted) */
  readonly payload: unknown
}

/**
 * Default TTL for cached responses (15 minutes)
 */
export const DEFAULT_CACHE_TTL_SECONDS = 15 * 60
