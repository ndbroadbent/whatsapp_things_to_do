/**
 * Scrape Previews Step
 *
 * Second scraping pass for resolved canonical URLs.
 * Scrapes OG metadata and builds LinkPreview objects.
 */

import { generateUrlCacheKey } from '../../caching/key'
import type { ScrapedMetadata } from '../../scraper/types'
import type { ResolvedEntity } from '../../search'
import type { GeocodedActivity, LinkPreview } from '../../types'
import type { PipelineContext } from './context'
import { type CachedScrapeResult, isCachedError, scrapeUrlBatch } from './scrape-helper'

const DEFAULT_TIMEOUT_MS = 4000
const DEFAULT_CONCURRENCY = 5

/**
 * Stats saved to scrape_previews_stats.json
 */
interface ScrapePreviewStats {
  readonly activitiesProcessed: number
  readonly withResolvedUrl: number
  readonly scraped: number
  readonly fromCache: number
  readonly failed: number
}

/**
 * Result of the scrape previews step.
 */
interface ScrapePreviewResult {
  /** Activities with linkPreview populated where applicable */
  readonly activities: readonly GeocodedActivity[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Scrape stats */
  readonly stats: ScrapePreviewStats
}

/**
 * Scrape previews step options.
 */
interface ScrapePreviewOptions {
  /** Timeout per URL in ms (default 4000) */
  readonly timeout?: number | undefined
  /** Number of concurrent scrapes (default 5) */
  readonly concurrency?: number | undefined
}

/**
 * Extract domain from URL for display.
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Build LinkPreview from scraped metadata and optional entity data.
 */
function buildLinkPreview(
  url: string,
  metadata: ScrapedMetadata | null,
  entity: ResolvedEntity | undefined,
  source: 'resolved' | 'scraped'
): LinkPreview {
  return {
    url: metadata?.canonicalUrl || url,
    title: metadata?.title ?? entity?.title ?? null,
    description: metadata?.description ?? entity?.description ?? null,
    imageUrl: metadata?.imageUrl ?? entity?.imageUrl ?? null,
    domain: extractDomain(url),
    source,
    entityType: entity?.type,
    externalIds: entity?.externalIds
      ? (Object.fromEntries(
          Object.entries(entity.externalIds).filter(([, v]) => v !== undefined)
        ) as Record<string, string>)
      : undefined
  }
}

/**
 * Run the scrape previews step.
 *
 * Second scraping pass for resolved canonical URLs.
 * Uses existing metadata from first scrape pass if available.
 * Scrapes fresh URLs for entity-resolved links.
 */
export async function stepScrapePreviews(
  ctx: PipelineContext,
  activities: readonly GeocodedActivity[],
  existingMetadata: Map<string, ScrapedMetadata>,
  resolvedEntities: ReadonlyMap<string, ResolvedEntity>,
  options?: ScrapePreviewOptions
): Promise<ScrapePreviewResult> {
  const { pipelineCache, apiCache, logger, skipPipelineCache } = ctx
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if scrape_previews_stats exists (completion marker)
  if (!skipPipelineCache && pipelineCache.hasStage('scrape_previews_stats')) {
    const cached = pipelineCache.getStage<GeocodedActivity[]>('scraped_previews') ?? []
    const stats = pipelineCache.getStage<ScrapePreviewStats>('scrape_previews_stats')
    logger.log('\n🖼️  Scraping previews... 📦 cached')
    return {
      activities: cached,
      fromCache: true,
      stats: stats ?? {
        activitiesProcessed: cached.length,
        withResolvedUrl: 0,
        scraped: 0,
        fromCache: 0,
        failed: 0
      }
    }
  }

  // Count activities with resolved URLs
  const withResolvedUrl = activities.filter((a) => a.resolvedUrl).length

  if (withResolvedUrl === 0) {
    logger.log('\n🖼️  Scraping previews... (no resolved URLs)')
    const stats: ScrapePreviewStats = {
      activitiesProcessed: activities.length,
      withResolvedUrl: 0,
      scraped: 0,
      fromCache: 0,
      failed: 0
    }
    pipelineCache.setStage('scrape_previews_stats', stats)
    pipelineCache.setStage('scraped_previews', [...activities])
    return { activities, fromCache: false, stats }
  }

  logger.log(`\n🖼️  Scraping previews for ${withResolvedUrl} resolved URLs...`)

  // Collect URLs that need scraping (not already in existingMetadata)
  const urlsToScrape = new Set<string>()
  for (const activity of activities) {
    if (activity.resolvedUrl && !existingMetadata.has(activity.resolvedUrl)) {
      urlsToScrape.add(activity.resolvedUrl)
    }
  }

  // Check API cache for already-scraped URLs
  const uncachedUrls: string[] = []
  const scrapedMetadata = new Map<string, ScrapedMetadata>(existingMetadata)

  for (const url of urlsToScrape) {
    const cacheKey = generateUrlCacheKey(url)
    const cached = await apiCache.get<CachedScrapeResult>(cacheKey)
    if (cached && !isCachedError(cached.data)) {
      scrapedMetadata.set(url, cached.data)
    } else if (!cached) {
      uncachedUrls.push(url)
    }
  }

  const fromApiCache = urlsToScrape.size - uncachedUrls.length

  if (uncachedUrls.length > 0) {
    logger.log(`   📥 ${uncachedUrls.length} URLs to scrape (${fromApiCache} cached)`)

    // Scrape uncached URLs in parallel using shared helper
    const freshlyScraped = await scrapeUrlBatch(uncachedUrls, apiCache, logger, {
      timeout,
      concurrency,
      progressFrequency: 5
    })

    // Merge freshly scraped metadata into our map
    for (const [url, metadata] of freshlyScraped) {
      scrapedMetadata.set(url, metadata)
    }
  }

  // Build LinkPreview for each activity with resolvedUrl
  let scraped = 0
  let failed = 0

  const activitiesWithPreviews: GeocodedActivity[] = activities.map((activity) => {
    if (!activity.resolvedUrl) {
      return activity
    }

    const metadata = scrapedMetadata.get(activity.resolvedUrl)
    const entity = resolvedEntities.get(activity.activityId)

    // Determine source: 'resolved' if from entity resolution, 'scraped' if from user URL
    const source: 'resolved' | 'scraped' = entity ? 'resolved' : 'scraped'

    // Build preview even with minimal/no metadata - we still have URL and possibly entity data
    const linkPreview = buildLinkPreview(activity.resolvedUrl, metadata ?? null, entity, source)

    if (metadata?.title || entity?.title) {
      scraped++
    } else {
      failed++
    }

    return {
      ...activity,
      linkPreview
    } as GeocodedActivity
  })

  const stats: ScrapePreviewStats = {
    activitiesProcessed: activities.length,
    withResolvedUrl,
    scraped,
    fromCache: existingMetadata.size + fromApiCache,
    failed
  }

  // Cache results
  pipelineCache.setStage('scraped_previews', [...activitiesWithPreviews])
  pipelineCache.setStage('scrape_previews_stats', stats)

  logger.log(`   ✓ ${scraped}/${withResolvedUrl} previews built`)
  if (stats.fromCache > 0) {
    logger.log(`   📦 ${stats.fromCache} from cache`)
  }
  if (failed > 0) {
    logger.log(`   ⚠️  ${failed} with minimal data`)
  }

  return { activities: activitiesWithPreviews, fromCache: false, stats }
}
