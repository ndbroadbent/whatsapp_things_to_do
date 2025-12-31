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
  readonly fromPexels: number
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
  fromPexels: number
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
  /** Skip media library (--no-image-cdn) */
  readonly skipMediaLibrary?: boolean | undefined
  /** Skip Pexels (no API key or --skip-pexels) - primary stock source */
  readonly skipPexels?: boolean | undefined
  /** Skip Pixabay (no API key or --skip-pixabay) - fallback stock source */
  readonly skipPixabay?: boolean | undefined
  /** Skip Wikipedia */
  readonly skipWikipedia?: boolean | undefined
  /** Skip Google Places */
  readonly skipGooglePlaces?: boolean | undefined
  /** Pexels API key (primary stock source) */
  readonly pexelsApiKey?: string | undefined
  /** Pixabay API key (fallback stock source) */
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
 * Validate cached ImageResult has correct format.
 * Throws if cache contains old format (missing meta property).
 */
function validateCachedImageResult(result: ImageResult | null, activityId: string): void {
  if (result === null) return

  if (!result.meta) {
    throw new Error(
      `Invalid cached ImageResult for activity ${activityId}: missing 'meta' property. ` +
        `Cache contains old format. Delete ~/.cache/chat-to-map and retry.`
    )
  }

  if (!result.meta.source) {
    throw new Error(
      `Invalid cached ImageResult for activity ${activityId}: missing 'meta.source'. ` +
        `Cache contains old format. Delete ~/.cache/chat-to-map and retry.`
    )
  }
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
    fromPexels: 0,
    fromPixabay: 0,
    fromUserUpload: 0,
    failed: 0
  }

  for (const result of images.values()) {
    if (result) {
      stats.imagesFound++
      incrementSourceCount(stats, result.meta.source)
    } else {
      stats.failed++
    }
  }

  return stats
}

/**
 * Increment the appropriate source count based on image source.
 */
function incrementSourceCount(stats: MutableStats, source: ImageResult['meta']['source']): void {
  switch (source) {
    case 'unsplash':
    case 'unsplash+':
      // Count both unsplash types together (from media library)
      stats.fromMediaLibrary++
      break
    case 'google_places':
      stats.fromGooglePlaces++
      break
    case 'wikipedia':
      stats.fromWikipedia++
      break
    case 'pexels':
      stats.fromPexels++
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
  if (stats.fromPexels > 0) logger.log(`   🖼️  ${stats.fromPexels} from Pexels`)
  if (stats.fromPixabay > 0) logger.log(`   📷 ${stats.fromPixabay} from Pixabay`)
  if (stats.fromGooglePlaces > 0) logger.log(`   📍 ${stats.fromGooglePlaces} from Google Places`)
  if (stats.failed > 0) logger.log(`   ⚠️  ${stats.failed} not found`)
}

/**
 * Build image fetch config from options and environment.
 */
function buildImageFetchConfig(options: FetchImagesOptions | undefined): ImageFetchConfig {
  return {
    skipMediaLibrary: options?.skipMediaLibrary ?? false,
    skipPexels: options?.skipPexels ?? false,
    skipPixabay: options?.skipPixabay ?? false,
    skipWikipedia: options?.skipWikipedia ?? false,
    skipGooglePlaces: options?.skipGooglePlaces ?? false,
    pexelsApiKey: options?.pexelsApiKey ?? process.env.PEXELS_API_KEY,
    pixabayApiKey: options?.pixabayApiKey ?? process.env.PIXABAY_API_KEY,
    googlePlacesApiKey: options?.googlePlacesApiKey ?? process.env.GOOGLE_MAPS_API_KEY,
    mediaLibraryPath: options?.mediaLibraryPath
  }
}

/**
 * Get list of available image sources based on config.
 */
function getAvailableSources(config: ImageFetchConfig): string[] {
  const sources: string[] = []
  if (!config.skipMediaLibrary) sources.push('Media Library')
  if (!config.skipGooglePlaces && config.googlePlacesApiKey) sources.push('Google Places')
  if (!config.skipPexels && config.pexelsApiKey) sources.push('Pexels')
  if (!config.skipPixabay && config.pixabayApiKey) sources.push('Pixabay')
  return sources
}

/**
 * Create empty stats object.
 */
function createEmptyStats(): FetchImagesStats {
  return {
    activitiesProcessed: 0,
    imagesFound: 0,
    fromMediaLibrary: 0,
    fromCdn: 0,
    fromGooglePlaces: 0,
    fromWikipedia: 0,
    fromPexels: 0,
    fromPixabay: 0,
    fromUserUpload: 0,
    failed: 0
  }
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
  const { pipelineCache, apiCache, logger, skipPipelineCache } = ctx
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if fetch_images_stats exists (completion marker)
  if (!skipPipelineCache && pipelineCache.hasStage('fetch_images_stats')) {
    const cached = pipelineCache.getStage<CachedImageData>('images')
    const stats = pipelineCache.getStage<FetchImagesStats>('fetch_images_stats')

    // Validate cached entries have correct format (fail fast on old cache format)
    for (const [activityId, result] of cached?.entries ?? []) {
      validateCachedImageResult(result, activityId)
    }

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
    const stats = createEmptyStats()
    pipelineCache.setStage('fetch_images_stats', stats)
    pipelineCache.setStage<CachedImageData>('images', { entries: [] })
    return { images: new Map(), fromCache: false, stats }
  }

  logger.log(`\n🖼️  Fetching images for ${activities.length} activities...`)

  // Build config from options and environment
  // NOTE: Scraped OG images are NOT used - they can only be link previews
  const config = buildImageFetchConfig(options)

  // Log what sources are available
  const sources = getAvailableSources(config)
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
