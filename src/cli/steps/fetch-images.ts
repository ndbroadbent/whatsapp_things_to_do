/**
 * Fetch Images Step
 *
 * Fetches images for geocoded activities from various sources.
 * Uses worker pool for parallel image fetching.
 * Writes fetch_images_stats.json as completion marker.
 */

import { fetchImageForActivity } from '../../images/index'
import type { ImageFetchConfig, ImageResult, ScrapedUrlMetadata } from '../../images/types'
import type { ScrapedMetadata } from '../../scraper/types'
import type { GeocodedActivity } from '../../types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

/** Cached scrape metadata structure from pipeline cache */
interface CachedScrapeMetadata {
  readonly entries: Array<[string, ScrapedMetadata]>
}

const DEFAULT_CONCURRENCY = 10

/**
 * Stats saved to fetch_images_stats.json
 */
interface FetchImagesStats {
  readonly activitiesProcessed: number
  readonly imagesFound: number
  readonly fromCdn: number
  readonly fromScraped: number
  readonly fromGooglePlaces: number
  readonly fromWikipedia: number
  readonly fromPixabay: number
  readonly failed: number
}

/**
 * Result of the fetch images step.
 */
interface FetchImagesResult {
  /** Map of messageId to image result */
  readonly images: Map<number, ImageResult | null>
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Stats */
  readonly stats: FetchImagesStats
}

/**
 * Fetch images step options.
 */
interface FetchImagesOptions {
  /** Skip CDN default images (--no-image-cdn) */
  readonly skipCdn?: boolean | undefined
  /** Skip Pixabay (no API key or --skip-pixabay) */
  readonly skipPixabay?: boolean | undefined
  /** Skip Wikipedia */
  readonly skipWikipedia?: boolean | undefined
  /** Skip Google Places */
  readonly skipGooglePlaces?: boolean | undefined
  /** Pixabay API key */
  readonly pixabayApiKey?: string | undefined
  /** Google Places API key */
  readonly googlePlacesApiKey?: string | undefined
  /** Number of concurrent image fetches (default 10) */
  readonly concurrency?: number | undefined
}

/** Serializable version of image results for caching */
interface CachedImageData {
  readonly entries: Array<[number, ImageResult | null]>
}

/**
 * Count source from image result.
 */
function countSource(result: ImageResult): keyof Omit<FetchImagesStats, 'activitiesProcessed'> {
  const sourceMap: Record<
    ImageResult['source'],
    keyof Omit<FetchImagesStats, 'activitiesProcessed'>
  > = {
    cdn: 'fromCdn',
    scraped: 'fromScraped',
    google_places: 'fromGooglePlaces',
    wikipedia: 'fromWikipedia',
    pixabay: 'fromPixabay'
  }
  return sourceMap[result.source]
}

/**
 * Calculate stats from image results.
 */
function calculateStats(images: Map<number, ImageResult | null>): FetchImagesStats {
  const stats = {
    activitiesProcessed: images.size,
    imagesFound: 0,
    fromCdn: 0,
    fromScraped: 0,
    fromGooglePlaces: 0,
    fromWikipedia: 0,
    fromPixabay: 0,
    failed: 0
  }

  for (const result of images.values()) {
    if (result) {
      stats.imagesFound++
      stats[countSource(result)]++
    } else {
      stats.failed++
    }
  }

  return stats
}

/**
 * Log stats about fetched images.
 */
function logStats(stats: FetchImagesStats, logger: PipelineContext['logger']): void {
  logger.log(`   ✓ ${stats.imagesFound}/${stats.activitiesProcessed} images found`)
  if (stats.fromCdn > 0) logger.log(`   📦 ${stats.fromCdn} from CDN`)
  if (stats.fromScraped > 0) logger.log(`   🔗 ${stats.fromScraped} from scraped URLs`)
  if (stats.fromWikipedia > 0) logger.log(`   📚 ${stats.fromWikipedia} from Wikipedia`)
  if (stats.fromPixabay > 0) logger.log(`   🖼️  ${stats.fromPixabay} from Pixabay`)
  if (stats.fromGooglePlaces > 0) logger.log(`   📍 ${stats.fromGooglePlaces} from Google Places`)
  if (stats.failed > 0) logger.log(`   ⚠️  ${stats.failed} not found`)
}

/**
 * Run the fetch images step.
 *
 * Uses worker pool for parallel image fetching.
 * Checks pipeline cache first, fetches fresh if needed.
 * Uses API cache for individual image results.
 */
export async function stepFetchImages(
  ctx: PipelineContext,
  activities: readonly GeocodedActivity[],
  options?: FetchImagesOptions
): Promise<FetchImagesResult> {
  const { pipelineCache, apiCache, logger, noCache } = ctx
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if fetch_images_stats exists (completion marker)
  if (!noCache && pipelineCache.hasStage('fetch_images_stats')) {
    const cached = pipelineCache.getStage<CachedImageData>('images')
    const stats = pipelineCache.getStage<FetchImagesStats>('fetch_images_stats')
    logger.log('\n🖼️  Fetching images... 📦 cached')
    const images = new Map(cached?.entries ?? [])
    return {
      images,
      fromCache: true,
      stats: stats ?? calculateStats(images)
    }
  }

  if (activities.length === 0) {
    logger.log('\n🖼️  Fetching images... (no activities)')
    const stats: FetchImagesStats = {
      activitiesProcessed: 0,
      imagesFound: 0,
      fromCdn: 0,
      fromScraped: 0,
      fromGooglePlaces: 0,
      fromWikipedia: 0,
      fromPixabay: 0,
      failed: 0
    }
    pipelineCache.setStage('fetch_images_stats', stats)
    pipelineCache.setStage<CachedImageData>('images', { entries: [] })
    return { images: new Map(), fromCache: false, stats }
  }

  logger.log(`\n🖼️  Fetching images for ${activities.length} activities...`)

  // Load scraped metadata from pipeline cache
  const cachedScrapeData = pipelineCache.getStage<CachedScrapeMetadata>('scrape_metadata')
  const scrapedMetadata = new Map<string, ScrapedUrlMetadata>()
  if (cachedScrapeData?.entries) {
    for (const [url, metadata] of cachedScrapeData.entries) {
      scrapedMetadata.set(url, {
        imageUrl: metadata.imageUrl,
        title: metadata.title,
        canonicalUrl: metadata.canonicalUrl
      })
    }
  }

  // Build config from options and environment
  const config: ImageFetchConfig = {
    skipCdn: options?.skipCdn ?? false,
    skipPixabay: options?.skipPixabay ?? false,
    skipWikipedia: options?.skipWikipedia ?? false,
    skipGooglePlaces: options?.skipGooglePlaces ?? false,
    pixabayApiKey: options?.pixabayApiKey ?? process.env.PIXABAY_API_KEY,
    googlePlacesApiKey:
      options?.googlePlacesApiKey ??
      process.env.GOOGLE_MAPS_API_KEY ??
      process.env.GOOGLE_MAPS_API_KEY,
    scrapedMetadata: scrapedMetadata.size > 0 ? scrapedMetadata : undefined
  }

  // Log what sources are available
  const sources: string[] = []
  if (scrapedMetadata.size > 0) sources.push('Scraped')
  if (!config.skipCdn) sources.push('CDN')
  if (!config.skipGooglePlaces && config.googlePlacesApiKey) sources.push('Google Places')
  if (!config.skipPixabay && config.pixabayApiKey) sources.push('Pixabay')
  logger.log(`   Sources: ${sources.join(', ') || 'none'}`)

  // Process activities in parallel using worker pool
  const poolResult = await runWorkerPool(
    activities,
    async (activity) => {
      const result = await fetchImageForActivity(activity, config, apiCache)
      return { messageId: activity.messageId, result }
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        if (completed % 10 === 0 || completed === total) {
          const percent = Math.floor((completed / total) * 100)
          logger.log(`   ${percent}% fetched (${completed}/${total} activities)`)
        }
      }
    }
  )

  // Collect results
  const images = new Map<number, ImageResult | null>()
  for (const { messageId, result } of poolResult.successes) {
    images.set(messageId, result)
  }

  const stats = calculateStats(images)

  // Cache results
  pipelineCache.setStage<CachedImageData>('images', {
    entries: [...images.entries()]
  })
  pipelineCache.setStage('fetch_images_stats', stats)

  logStats(stats, logger)

  return { images, fromCache: false, stats }
}
