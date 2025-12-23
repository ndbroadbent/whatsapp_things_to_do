/**
 * Scrape Step
 *
 * Scrape URLs from candidates and return metadata.
 * Uses parallel scraping with caching.
 */

import { extractUrlsFromCandidates, fetchMetadataForUrls } from '../../scraper/metadata'
import type { ScrapedMetadata } from '../../scraper/types'
import type { CandidateMessage } from '../../types'
import type { PipelineContext } from './context'

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
  /** Skip logging */
  readonly quiet?: boolean | undefined
  /** Show verbose progress */
  readonly verbose?: boolean | undefined
}

/** Serializable version of scrape results for caching */
interface CachedScrapeData {
  readonly entries: Array<[string, ScrapedMetadata]>
  readonly allUrls: readonly string[]
}

/**
 * Run the scrape step.
 *
 * Checks pipeline cache first, scrapes fresh if needed.
 * Uses API cache for individual URL results.
 */
export async function stepScrape(
  ctx: PipelineContext,
  candidates: readonly CandidateMessage[],
  options?: ScrapeOptions
): Promise<ScrapeStepResult> {
  const { pipelineCache, apiCache, logger, noCache } = ctx

  // Check pipeline cache (skip if noCache)
  if (!noCache && pipelineCache.hasStage('scrape_stats')) {
    const stats = pipelineCache.getStage<ScrapeStats>('scrape_stats')
    const cached = pipelineCache.getStage<CachedScrapeData>('scrape_metadata')
    if (stats && cached) {
      if (!options?.quiet) {
        logger.log('\n🔗 Scraping URLs... 📦 cached')
      }
      const metadataMap = new Map(cached.entries)
      return { metadataMap, urls: cached.allUrls, fromCache: true, stats }
    }
  }

  // Extract URLs to check if scraping is needed
  const urls = extractUrlsFromCandidates(candidates)

  if (urls.length === 0) {
    if (!options?.quiet) {
      logger.log('\n🔗 Scraping URLs... (no URLs found)')
    }
    const stats: ScrapeStats = {
      urlCount: 0,
      successCount: 0,
      failedCount: 0,
      cachedCount: 0
    }
    pipelineCache.setStage('scrape_stats', stats)
    return { metadataMap: new Map(), urls: [], fromCache: false, stats }
  }

  if (!options?.quiet) {
    logger.log(`\n🔗 Scraping ${urls.length} URLs...`)
  }

  // Track progress
  let successCount = 0
  let failedCount = 0
  let cachedCount = 0

  const metadataMap = await fetchMetadataForUrls(urls, {
    timeout: options?.timeout ?? 4000,
    cache: apiCache,
    onScrapeStart: (info) => {
      cachedCount = info.cachedCount
      if (!options?.quiet && info.cachedCount > 0) {
        logger.log(`   (${info.cachedCount} cached, ${info.urlCount} to fetch)`)
      }
    },
    onUrlScraped: (info) => {
      if (info.success) {
        successCount++
      } else {
        failedCount++
      }
      if (options?.verbose && !options?.quiet) {
        const domain = new URL(info.url).hostname.replace('www.', '')
        const prefix = `   [${info.current}/${info.total}]`
        if (info.success) {
          logger.log(`${prefix} ✓ ${domain}`)
        } else {
          logger.log(`${prefix} ✗ ${domain}: ${info.error}`)
        }
      }
    }
  })

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

  if (!options?.quiet) {
    logger.log(`   ✓ ${successCount} scraped, ${failedCount} failed, ${cachedCount} cached`)
  }

  return { metadataMap, urls, fromCache: false, stats }
}
