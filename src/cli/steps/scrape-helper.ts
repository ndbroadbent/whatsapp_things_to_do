/**
 * Shared Scraping Helpers
 *
 * Common utilities for URL scraping used by scrape-urls and scrape-previews steps.
 */

import type { FilesystemCache } from '../../caching/filesystem'
import { generateUrlCacheKey } from '../../caching/key'
import { scrapeUrl } from '../../scraper/index'
import type { ScrapedMetadata } from '../../scraper/types'
import type { Logger } from '../logger'
import { runWorkerPool } from '../worker-pool'

/** Marker for cached errors */
interface CachedError {
  error: true
  message: string
}

export type CachedScrapeResult = ScrapedMetadata | CachedError

export function isCachedError(data: CachedScrapeResult): data is CachedError {
  return 'error' in data && data.error === true
}

/** Result of scraping a single URL */
interface ScrapeWorkerResult {
  url: string
  metadata: ScrapedMetadata | null
  success: boolean
}

/**
 * Scrape a batch of URLs in parallel with caching.
 * Returns a map of URL to scraped metadata.
 */
export async function scrapeUrlBatch(
  urls: readonly string[],
  apiCache: FilesystemCache,
  logger: Logger,
  options: {
    timeout: number
    concurrency: number
    progressFrequency?: number
  }
): Promise<Map<string, ScrapedMetadata>> {
  const { timeout, concurrency, progressFrequency = 10 } = options
  const metadataMap = new Map<string, ScrapedMetadata>()

  // Scrape URLs in parallel using worker pool
  const poolResult = await runWorkerPool(
    urls,
    async (url): Promise<ScrapeWorkerResult> => {
      const cacheKey = generateUrlCacheKey(url)

      try {
        const result = await scrapeUrl(url, { timeout })

        if (result.ok) {
          await apiCache.set(cacheKey, { data: result.metadata, cachedAt: Date.now() })
          return { url, metadata: result.metadata, success: true }
        }

        // Scrape failed - check if we got a redirect URL
        const errorMsg = result.error?.message ?? 'Unknown error'
        const finalUrl = result.error?.finalUrl

        if (finalUrl) {
          // Create minimal metadata with redirect URL
          const minimalMetadata: ScrapedMetadata = {
            canonicalUrl: finalUrl,
            contentId: null,
            title: null,
            description: null,
            hashtags: [],
            creator: null,
            imageUrl: null,
            categories: [],
            suggestedKeywords: []
          }
          await apiCache.set(cacheKey, { data: minimalMetadata, cachedAt: Date.now() })
          return { url, metadata: minimalMetadata, success: true }
        }

        // No redirect - cache the error
        await apiCache.set(cacheKey, {
          data: { error: true, message: errorMsg } as CachedError,
          cachedAt: Date.now()
        })
        return { url, metadata: null, success: false }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Timeout'
        await apiCache.set(cacheKey, {
          data: { error: true, message: errorMsg } as CachedError,
          cachedAt: Date.now()
        })
        return { url, metadata: null, success: false }
      }
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        if (completed % progressFrequency === 0 || completed === total) {
          const percent = Math.floor((completed / total) * 100)
          logger.log(`   ${percent}% scraped (${completed}/${total} URLs)`)
        }
      }
    }
  )

  // Collect successful results
  for (const result of poolResult.successes) {
    if (result.metadata) {
      metadataMap.set(result.url, result.metadata)
    }
  }

  return metadataMap
}
