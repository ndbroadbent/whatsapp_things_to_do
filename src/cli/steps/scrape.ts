/**
 * Scrape Step
 *
 * Scrape URLs from candidates and enrich with metadata.
 * Uses parallel scraping with caching.
 */

import { extractUrlsFromCandidates, scrapeAndEnrichCandidates } from '../../scraper/enrich'
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
interface ScrapeResult {
  /** Enriched candidates with URL metadata */
  readonly candidates: readonly CandidateMessage[]
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
): Promise<ScrapeResult> {
  const { pipelineCache, apiCache, logger, noCache } = ctx

  // Check pipeline cache (skip if noCache)
  if (!noCache && pipelineCache.hasStage('scrape_stats')) {
    const stats = pipelineCache.getStage<ScrapeStats>('scrape_stats')
    const enriched = pipelineCache.getStage<CandidateMessage[]>('enriched_candidates')
    if (stats && enriched) {
      if (!options?.quiet) {
        logger.log('\n🔗 Scraping URLs... 📦 cached')
      }
      return { candidates: enriched, fromCache: true, stats }
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
    pipelineCache.setStage('enriched_candidates', [...candidates])
    return { candidates, fromCache: false, stats }
  }

  if (!options?.quiet) {
    logger.log(`\n🔗 Scraping ${urls.length} URLs...`)
  }

  // Track progress
  let successCount = 0
  let failedCount = 0
  let cachedCount = 0

  const enriched = await scrapeAndEnrichCandidates(candidates, {
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

  // Cache results
  pipelineCache.setStage('scrape_stats', stats)
  pipelineCache.setStage('enriched_candidates', [...enriched])

  if (!options?.quiet) {
    logger.log(`   ✓ ${successCount} scraped, ${failedCount} failed, ${cachedCount} cached`)
  }

  return { candidates: enriched, fromCache: false, stats }
}
