/**
 * Place Lookup Step
 *
 * Looks up places for classified activities using Google Maps API.
 * Uses worker pool for parallel API calls with caching at both pipeline and API levels.
 */

import { countWithCoordinates, lookupActivityPlace } from '../../place-lookup/index'
import type { ClassifiedActivity, GeocodedActivity, PlaceLookupConfig } from '../../types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

const DEFAULT_CONCURRENCY = 10

/**
 * Stats saved to place_lookup_stats.json
 */
interface PlaceLookupStats {
  readonly activitiesProcessed: number
  readonly activitiesGeocoded: number
  readonly fromGoogleMapsUrl: number
  readonly fromGoogleGeocoding: number
  readonly fromPlaceSearch: number
  readonly failed: number
}

/**
 * Result of the place lookup step.
 */
interface PlaceLookupResult {
  /** Geocoded activities */
  readonly activities: readonly GeocodedActivity[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Place lookup stats */
  readonly stats: PlaceLookupStats
}

/**
 * Place lookup step options.
 */
interface PlaceLookupOptions {
  /** Home country for location context */
  readonly homeCountry?: string | undefined
  /** Region bias (2-letter country code) */
  readonly regionBias?: string | undefined
  /** Number of concurrent place lookup requests (default 10) */
  readonly concurrency?: number | undefined
}

/**
 * Calculate place lookup stats from results.
 */
function calculateStats(activities: readonly GeocodedActivity[]): PlaceLookupStats {
  let fromGoogleMapsUrl = 0
  let fromGoogleGeocoding = 0
  let fromPlaceSearch = 0
  let failed = 0

  for (const a of activities) {
    if (a.latitude !== undefined && a.longitude !== undefined) {
      switch (a.placeLookupSource) {
        case 'google_maps_url':
          fromGoogleMapsUrl++
          break
        case 'geocoding_api':
          fromGoogleGeocoding++
          break
        case 'places_api':
          fromPlaceSearch++
          break
      }
    } else {
      failed++
    }
  }

  return {
    activitiesProcessed: activities.length,
    activitiesGeocoded: countWithCoordinates(activities),
    fromGoogleMapsUrl,
    fromGoogleGeocoding,
    fromPlaceSearch,
    failed
  }
}

/**
 * Run the place lookup step.
 *
 * Uses worker pool for parallel place lookups.
 * Checks pipeline cache first, calls Google Maps API if needed.
 * Uses API cache for individual lookup results.
 */
export async function stepPlaceLookup(
  ctx: PipelineContext,
  activities: readonly ClassifiedActivity[],
  options?: PlaceLookupOptions
): Promise<PlaceLookupResult> {
  const { pipelineCache, apiCache, logger, skipPipelineCache } = ctx
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if place_lookup_stats exists (completion marker)
  if (!skipPipelineCache && pipelineCache.hasStage('place_lookup_stats')) {
    const cached = pipelineCache.getStage<GeocodedActivity[]>('place_lookups') ?? []
    const stats = pipelineCache.getStage<PlaceLookupStats>('place_lookup_stats')
    logger.log('\n🌍 Looking up places... 📦 cached')
    return {
      activities: cached,
      fromCache: true,
      stats: stats ?? calculateStats(cached)
    }
  }

  if (activities.length === 0) {
    logger.log('\n🌍 Looking up places... (no activities)')
    const stats: PlaceLookupStats = {
      activitiesProcessed: 0,
      activitiesGeocoded: 0,
      fromGoogleMapsUrl: 0,
      fromGoogleGeocoding: 0,
      fromPlaceSearch: 0,
      failed: 0
    }
    pipelineCache.setStage('place_lookup_stats', stats)
    pipelineCache.setStage('place_lookups', [])
    return { activities: [], fromCache: false, stats }
  }

  // Get API key from environment
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY environment variable required')
  }

  logger.log(`\n🌍 Looking up places for ${activities.length} activities...`)

  const config: PlaceLookupConfig = {
    apiKey,
    defaultCountry: options?.homeCountry,
    regionBias: options?.regionBias
  }

  // Process activities in parallel using worker pool
  const poolResult = await runWorkerPool(
    activities,
    async (activity) => {
      return lookupActivityPlace(activity, config, apiCache)
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        if (completed % 10 === 0 || completed === total) {
          const percent = Math.floor((completed / total) * 100)
          logger.log(`   ${percent}% looked up (${completed}/${total} activities)`)
        }
      }
    }
  )

  // Collect results - successes are in order
  const geocodedActivities: GeocodedActivity[] = poolResult.successes

  const stats = calculateStats(geocodedActivities)

  // Cache results
  pipelineCache.setStage('place_lookups', [...geocodedActivities])
  pipelineCache.setStage('place_lookup_stats', stats)

  logger.log(`   ✓ ${stats.activitiesGeocoded}/${stats.activitiesProcessed} places found`)
  if (stats.fromGoogleMapsUrl > 0) {
    logger.log(`   📍 ${stats.fromGoogleMapsUrl} from Google Maps URLs`)
  }
  if (stats.fromGoogleGeocoding > 0) {
    logger.log(`   🔍 ${stats.fromGoogleGeocoding} from address geocoding`)
  }
  if (stats.fromPlaceSearch > 0) {
    logger.log(`   🏢 ${stats.fromPlaceSearch} from place search`)
  }
  if (stats.failed > 0) {
    logger.log(`   ⚠️  ${stats.failed} could not be geocoded`)
  }

  return { activities: geocodedActivities, fromCache: false, stats }
}
