/**
 * Scrape URLs Step
 *
 * Scrape URLs from candidates and return metadata.
 * Uses worker pool for parallel scraping with caching.
 */

import { generateUrlCacheKey } from '../../caching/key'
import { scrapeUrl } from '../../scraper/index'
import { extractUrlsFromCandidates } from '../../scraper/metadata'
import type { ScrapedMetadata } from '../../scraper/types'
import type { CandidateMessage } from '../../types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_CONCURRENCY = 5

/**
 * Stats saved to scrape_stats.json
 */
interface ScrapeStats {
  readonly urlCount: number
  readonly successCount: number
  readonly failedCount: number
  readonly cachedCount: number
}

/**
 * Result of the scrape step.
 */
interface ScrapeStepResult {
  /** Map of URL to scraped metadata */
  readonly metadataMap: Map<string, ScrapedMetadata>
  /** URLs found in candidates */
  readonly urls: readonly string[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Scrape stats */
  readonly stats: ScrapeStats
}

/**
 * Scrape step options.
 */
interface ScrapeOptions {
  /** Timeout per URL in ms (default 4000) */
  readonly timeout?: number | undefined
  /** Number of concurrent scrapes (default 5) */
  readonly concurrency?: number | undefined
}

/** Serializable version of scrape results for caching */
interface CachedScrapeData {
  readonly entries: Array<[string, ScrapedMetadata]>
  readonly allUrls: readonly string[]
}

/** Marker for cached errors */
interface CachedError {
  error: true
  message: string
}

type CachedScrapeResult = ScrapedMetadata | CachedError

function isCachedError(data: CachedScrapeResult): data is CachedError {
  return 'error' in data && data.error === true
}

/**
 * Run the scrape step.
 *
 * Uses worker pool for parallel scraping.
 * Checks pipeline cache first, scrapes fresh if needed.
 * Uses API cache for individual URL results.
 */
export async function stepScrapeUrls(
  ctx: PipelineContext,
  candidates: readonly CandidateMessage[],
  options?: ScrapeOptions
): Promise<ScrapeStepResult> {
  const { pipelineCache, apiCache, logger, skipPipelineCache } = ctx
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if scrape_stats exists (completion marker)
  if (!skipPipelineCache && pipelineCache.hasStage('scrape_stats')) {
    const stats = pipelineCache.getStage<ScrapeStats>('scrape_stats')
    const cached = pipelineCache.getStage<CachedScrapeData>('scrape_metadata')
    if (stats && cached) {
      logger.log('\n🔗 Scraping URLs... 📦 cached')
      const metadataMap = new Map(cached.entries)
      return { metadataMap, urls: cached.allUrls, fromCache: true, stats }
    }
  }

  // Extract URLs to check if scraping is needed
  const urls = extractUrlsFromCandidates(candidates)

  if (urls.length === 0) {
    logger.log('\n🔗 Scraping URLs... (no URLs found)')
    const stats: ScrapeStats = {
      urlCount: 0,
      successCount: 0,
      failedCount: 0,
      cachedCount: 0
    }
    pipelineCache.setStage('scrape_stats', stats)
    return { metadataMap: new Map(), urls: [], fromCache: false, stats }
  }

  // Check API cache to separate cached vs uncached URLs
  const uncachedUrls: string[] = []
  const metadataMap = new Map<string, ScrapedMetadata>()

  for (const url of urls) {
    const cacheKey = generateUrlCacheKey(url)
    const cached = await apiCache.get<CachedScrapeResult>(cacheKey)
    if (cached) {
      if (!isCachedError(cached.data)) {
        metadataMap.set(url, cached.data)
      }
      // Skip - already cached (success or error)
    } else {
      uncachedUrls.push(url)
    }
  }

  const cachedCount = urls.length - uncachedUrls.length

  if (uncachedUrls.length === 0) {
    logger.log(`\n🔗 Scraping ${urls.length} URLs... 📦 all cached`)
    const stats: ScrapeStats = {
      urlCount: urls.length,
      successCount: metadataMap.size,
      failedCount: cachedCount - metadataMap.size,
      cachedCount
    }
    pipelineCache.setStage('scrape_stats', stats)
    pipelineCache.setStage<CachedScrapeData>('scrape_metadata', {
      entries: [...metadataMap.entries()],
      allUrls: urls
    })
    return { metadataMap, urls, fromCache: false, stats }
  }

  logger.log(`\n🔗 Scraping ${urls.length} URLs...`)
  if (cachedCount > 0) {
    logger.log(`   (${cachedCount} cached, ${uncachedUrls.length} to fetch)`)
  }

  // Scrape uncached URLs in parallel using worker pool
  const poolResult = await runWorkerPool(
    uncachedUrls,
    async (url) => {
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
          return { url, metadata: minimalMetadata, success: true, error: errorMsg }
        }

        // No redirect - cache the error
        await apiCache.set(cacheKey, {
          data: { error: true, message: errorMsg } as CachedError,
          cachedAt: Date.now()
        })
        return { url, metadata: null, success: false, error: errorMsg }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : 'Timeout'
        await apiCache.set(cacheKey, {
          data: { error: true, message: errorMsg } as CachedError,
          cachedAt: Date.now()
        })
        return { url, metadata: null, success: false, error: errorMsg }
      }
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        if (completed % 10 === 0 || completed === total) {
          const percent = Math.floor((completed / total) * 100)
          logger.log(`   ${percent}% scraped (${completed}/${total} URLs)`)
        }
      }
    }
  )

  // Collect results
  let successCount = cachedCount > 0 ? metadataMap.size : 0
  let failedCount = 0

  for (const result of poolResult.successes) {
    if (result.metadata) {
      metadataMap.set(result.url, result.metadata)
      successCount++
    } else {
      failedCount++
    }
  }

  failedCount += poolResult.errorCount

  const stats: ScrapeStats = {
    urlCount: urls.length,
    successCount,
    failedCount,
    cachedCount
  }

  // Cache results (convert Map to array for JSON serialization)
  pipelineCache.setStage('scrape_stats', stats)
  pipelineCache.setStage<CachedScrapeData>('scrape_metadata', {
    entries: [...metadataMap.entries()],
    allUrls: urls
  })

  logger.log(`   ✓ ${successCount} scraped, ${failedCount} failed, ${cachedCount} cached`)

  return { metadataMap, urls, fromCache: false, stats }
}
