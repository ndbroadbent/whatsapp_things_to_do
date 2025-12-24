/**
 * Cache Module
 *
 * Pluggable API response caching to prevent duplicate calls on retries.
 */

export { FilesystemCache } from './filesystem'
export {
  generateCacheKey,
  generateClassifierCacheKey,
  generateEmbeddingCacheKey,
  generateGeocodeCacheKey,
  generateImageCacheKey
} from './key'
export { hashFileBytes, PipelineCache, type PipelineStage } from './pipeline'
export type { CachedResponse, CacheKeyComponents, ResponseCache } from './types'
