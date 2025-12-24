/**
 * Geocode Step
 *
 * Geocodes classified activities using Google Maps API.
 * Uses worker pool for parallel API calls with caching at both pipeline and API levels.
 */

import { countGeocoded, geocodeActivity } from '../../geocoder/index'
import type { ClassifiedActivity, GeocodedActivity, GeocoderConfig } from '../../types'
import { runWorkerPool } from '../worker-pool'
import type { PipelineContext } from './context'

const DEFAULT_CONCURRENCY = 10

/**
 * Stats saved to geocode_stats.json
 */
interface GeocodeStats {
  readonly activitiesProcessed: number
  readonly activitiesGeocoded: number
  readonly fromGoogleMapsUrl: number
  readonly fromGoogleGeocoding: number
  readonly fromPlaceSearch: number
  readonly failed: number
}

/**
 * Result of the geocode step.
 */
interface GeocodeResult {
  /** Geocoded activities */
  readonly activities: readonly GeocodedActivity[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Geocoding stats */
  readonly stats: GeocodeStats
}

/**
 * Geocode step options.
 */
interface GeocodeOptions {
  /** Home country for location context */
  readonly homeCountry?: string | undefined
  /** Region bias (2-letter country code) */
  readonly regionBias?: string | undefined
  /** Number of concurrent geocode requests (default 10) */
  readonly concurrency?: number | undefined
}

/**
 * Calculate geocoding stats from results.
 */
function calculateStats(activities: readonly GeocodedActivity[]): GeocodeStats {
  let fromGoogleMapsUrl = 0
  let fromGoogleGeocoding = 0
  let fromPlaceSearch = 0
  let failed = 0

  for (const a of activities) {
    if (a.latitude !== undefined && a.longitude !== undefined) {
      switch (a.geocodeSource) {
        case 'google_maps_url':
          fromGoogleMapsUrl++
          break
        case 'google_geocoding':
          fromGoogleGeocoding++
          break
        case 'place_search':
          fromPlaceSearch++
          break
      }
    } else {
      failed++
    }
  }

  return {
    activitiesProcessed: activities.length,
    activitiesGeocoded: countGeocoded(activities),
    fromGoogleMapsUrl,
    fromGoogleGeocoding,
    fromPlaceSearch,
    failed
  }
}

/**
 * Run the geocode step.
 *
 * Uses worker pool for parallel geocoding.
 * Checks pipeline cache first, calls geocoder API if needed.
 * Uses API cache for individual geocoding results.
 */
export async function stepGeocode(
  ctx: PipelineContext,
  activities: readonly ClassifiedActivity[],
  options?: GeocodeOptions
): Promise<GeocodeResult> {
  const { pipelineCache, apiCache, logger, noCache } = ctx
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY

  // Check pipeline cache - only valid if geocode_stats exists (completion marker)
  if (!noCache && pipelineCache.hasStage('geocode_stats')) {
    const cached = pipelineCache.getStage<GeocodedActivity[]>('geocodings') ?? []
    const stats = pipelineCache.getStage<GeocodeStats>('geocode_stats')
    logger.log('\n🌍 Geocoding activities... 📦 cached')
    return {
      activities: cached,
      fromCache: true,
      stats: stats ?? calculateStats(cached)
    }
  }

  if (activities.length === 0) {
    logger.log('\n🌍 Geocoding activities... (no activities)')
    const stats: GeocodeStats = {
      activitiesProcessed: 0,
      activitiesGeocoded: 0,
      fromGoogleMapsUrl: 0,
      fromGoogleGeocoding: 0,
      fromPlaceSearch: 0,
      failed: 0
    }
    pipelineCache.setStage('geocode_stats', stats)
    pipelineCache.setStage('geocodings', [])
    return { activities: [], fromCache: false, stats }
  }

  // Get API key from environment
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY or GOOGLE_API_KEY environment variable required')
  }

  logger.log(`\n🌍 Geocoding ${activities.length} activities...`)

  const config: GeocoderConfig = {
    apiKey,
    defaultCountry: options?.homeCountry,
    regionBias: options?.regionBias
  }

  // Process activities in parallel using worker pool
  const poolResult = await runWorkerPool(
    activities,
    async (activity) => {
      return geocodeActivity(activity, config, apiCache)
    },
    {
      concurrency,
      onProgress: ({ completed, total }) => {
        if (completed % 10 === 0 || completed === total) {
          const percent = Math.floor((completed / total) * 100)
          logger.log(`   ${percent}% geocoded (${completed}/${total} activities)`)
        }
      }
    }
  )

  // Collect results - successes are in order
  const geocodedActivities: GeocodedActivity[] = poolResult.successes

  const stats = calculateStats(geocodedActivities)

  // Cache results
  pipelineCache.setStage('geocodings', [...geocodedActivities])
  pipelineCache.setStage('geocode_stats', stats)

  logger.log(`   ✓ ${stats.activitiesGeocoded}/${stats.activitiesProcessed} geocoded`)
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
