/**
 * Fetch Image URLs Step
 *
 * Fetches image URLs for geocoded activities from various sources.
 * Uses worker pool for parallel image fetching.
 * Writes fetch_images_stats.json as completion marker.
 *
 * ⚠️ LEGAL NOTICE: OpenGraph/scraped images are NOT used here.
 * OG images can ONLY be used for inline link previews (shown with the URL).
 * Using them as activity images = republishing = copyright infringement.
 * See project_docs/IMAGES.md for full licensing rules.
 */

import { fetchImageForActivity } from '../../images/index'
import type { ImageFetchConfig, ImageResult } from '../../images/types'
import type { GeocodedActivity } from '../../types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

const DEFAULT_CONCURRENCY = 10

/**
 * Stats saved to fetch_images_stats.json
 */
interface FetchImagesStats {
  readonly activitiesProcessed: number
  readonly imagesFound: number
  readonly fromMediaLibrary: number
  readonly fromCdn: number
  readonly fromGooglePlaces: number
  readonly fromWikipedia: number
  readonly fromPixabay: number
  readonly fromUserUpload: number
  readonly failed: number
}

/** Mutable version for accumulation */
interface MutableStats {
  activitiesProcessed: number
  imagesFound: number
  fromMediaLibrary: number
  fromCdn: number
  fromGooglePlaces: number
  fromWikipedia: number
  fromPixabay: number
  fromUserUpload: number
  failed: number
}

/**
 * Result of the fetch images step.
 */
interface FetchImagesResult {
  /** Map of activityId to image result */
  readonly images: Map<string, ImageResult | null>
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
  /** Local path to media library images (for development/offline use) */
  readonly mediaLibraryPath?: string | undefined
}

/** Serializable version of image results for caching */
interface CachedImageData {
  readonly entries: Array<[string, ImageResult | null]>
}

/**
 * Calculate stats from image results.
 */
function calculateStats(images: Map<string, ImageResult | null>): FetchImagesStats {
  const stats: MutableStats = {
    activitiesProcessed: images.size,
    imagesFound: 0,
    fromMediaLibrary: 0,
    fromCdn: 0,
    fromGooglePlaces: 0,
    fromWikipedia: 0,
    fromPixabay: 0,
    fromUserUpload: 0,
    failed: 0
  }

  for (const result of images.values()) {
    if (result) {
      stats.imagesFound++
      incrementSourceCount(stats, result.source)
    } else {
      stats.failed++
    }
  }

  return stats
}

/**
 * Increment the appropriate source count based on image source.
 */
function incrementSourceCount(stats: MutableStats, source: ImageResult['source']): void {
  switch (source) {
    case 'media_library':
      stats.fromMediaLibrary++
      break
    case 'cdn':
      stats.fromCdn++
      break
    case 'google_places':
      stats.fromGooglePlaces++
      break
    case 'wikipedia':
      stats.fromWikipedia++
      break
    case 'pixabay':
      stats.fromPixabay++
      break
    case 'user_upload':
      stats.fromUserUpload++
      break
  }
}

/**
 * Log stats about fetched images.
 */
function logStats(stats: FetchImagesStats, logger: PipelineContext['logger']): void {
  logger.log(`   ✓ ${stats.imagesFound}/${stats.activitiesProcessed} images found`)
  if (stats.fromMediaLibrary > 0) logger.log(`   📸 ${stats.fromMediaLibrary} from Media Library`)
  if (stats.fromCdn > 0) logger.log(`   📦 ${stats.fromCdn} from CDN`)
  if (stats.fromUserUpload > 0) logger.log(`   📤 ${stats.fromUserUpload} from user uploads`)
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
export async function stepFetchImageUrls(
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
      fromMediaLibrary: 0,
      fromCdn: 0,
      fromGooglePlaces: 0,
      fromWikipedia: 0,
      fromPixabay: 0,
      fromUserUpload: 0,
      failed: 0
    }
    pipelineCache.setStage('fetch_images_stats', stats)
    pipelineCache.setStage<CachedImageData>('images', { entries: [] })
    return { images: new Map(), fromCache: false, stats }
  }

  logger.log(`\n🖼️  Fetching images for ${activities.length} activities...`)

  // Build config from options and environment
  // NOTE: Scraped OG images are NOT used - they can only be link previews
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
    mediaLibraryPath: options?.mediaLibraryPath
  }

  // Log what sources are available
  const sources: string[] = []
  if (!config.skipCdn) sources.push('CDN')
  if (!config.skipGooglePlaces && config.googlePlacesApiKey) sources.push('Google Places')
  if (!config.skipPixabay && config.pixabayApiKey) sources.push('Pixabay')
  logger.log(`   Sources: ${sources.join(', ') || 'none'}`)

  // Process activities in parallel using worker pool
  const poolResult = await runWorkerPool(
    activities,
    async (activity) => {
      const result = await fetchImageForActivity(activity, config, apiCache)
      return { activityId: activity.activityId, result }
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
  const images = new Map<string, ImageResult | null>()
  for (const { activityId, result } of poolResult.successes) {
    images.set(activityId, result)
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
