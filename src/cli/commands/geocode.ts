/**
 * Geocode Command
 *
 * Geocodes classified activities using Google Maps API.
 * Runs: parse → scan → embed → filter → scrape → classify → geocode
 */

import { writeFile } from 'node:fs/promises'
import { filterGeocoded } from '../../geocoder/index'
import { formatLocation, type GeocodedActivity } from '../../types'
import type { CLIArgs } from '../args'
import {
  formatActivityHeader,
  initCommandContext,
  type OutputMessage,
  toOutputMessages,
  truncate
} from '../helpers'
import type { Logger } from '../logger'
import { stepGeocode } from '../steps/geocode'
import { StepRunner } from '../steps/runner'

interface GeocodeOutput {
  activitiesProcessed: number
  activitiesGeocoded: number
  fromGoogleMapsUrl: number
  fromGoogleGeocoding: number
  fromPlaceSearch: number
  failed: number
  activities: Array<{
    activity: string
    category: string
    messages: OutputMessage[]
    mentionCount: number
    venue: string | null
    city: string | null
    country: string | null
    latitude: number | undefined
    longitude: number | undefined
    formattedAddress: string | undefined
    placeId: string | undefined
    isVenuePlaceId: boolean | undefined
    geocodeSource: string | undefined
  }>
}

export async function cmdGeocode(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, config } = await initCommandContext('Geocode', args, logger)

  // Use StepRunner to handle dependencies: classify → geocode
  const runner = new StepRunner(ctx, args, config, logger)

  // Run classify step (which runs parse → scan → embed → filter → scrape → classify)
  const { activities: classifiedActivities } = await runner.run('classify')

  logger.log(`   Classified ${classifiedActivities.length} activities`)

  if (classifiedActivities.length === 0) {
    logger.log('\n⚠️  No activities classified. Nothing to geocode.')
    return
  }

  // Dry run: show stats and exit
  if (args.dryRun) {
    logger.log('\n📊 Geocoding Estimate (dry run)')
    logger.log(`   Activities to geocode: ${classifiedActivities.length}`)
    const withLocation = classifiedActivities.filter((a) => formatLocation(a)).length
    logger.log(`   With location info: ${withLocation}`)
    logger.log(`   Without location: ${classifiedActivities.length - withLocation}`)
    return
  }

  // Run geocode step
  const geocodeResult = await stepGeocode(ctx, classifiedActivities, {
    homeCountry: args.homeCountry
  })

  // Summary
  logger.log('\n📊 Geocoding Results')
  logger.log(`   Processed: ${geocodeResult.stats.activitiesProcessed}`)
  logger.log(`   Geocoded: ${geocodeResult.stats.activitiesGeocoded}`)
  if (geocodeResult.stats.fromGoogleMapsUrl > 0) {
    logger.log(`   From Maps URLs: ${geocodeResult.stats.fromGoogleMapsUrl}`)
  }
  if (geocodeResult.stats.fromGoogleGeocoding > 0) {
    logger.log(`   From address: ${geocodeResult.stats.fromGoogleGeocoding}`)
  }
  if (geocodeResult.stats.fromPlaceSearch > 0) {
    logger.log(`   From place search: ${geocodeResult.stats.fromPlaceSearch}`)
  }
  if (geocodeResult.stats.failed > 0) {
    logger.log(`   Failed: ${geocodeResult.stats.failed}`)
  }

  const output: GeocodeOutput = {
    activitiesProcessed: geocodeResult.stats.activitiesProcessed,
    activitiesGeocoded: geocodeResult.stats.activitiesGeocoded,
    fromGoogleMapsUrl: geocodeResult.stats.fromGoogleMapsUrl,
    fromGoogleGeocoding: geocodeResult.stats.fromGoogleGeocoding,
    fromPlaceSearch: geocodeResult.stats.fromPlaceSearch,
    failed: geocodeResult.stats.failed,
    activities: geocodeResult.activities.map((a) => ({
      activity: a.activity,
      category: a.category,
      messages: toOutputMessages(a.messages),
      mentionCount: a.messages.length,
      venue: a.venue,
      city: a.city,
      country: a.country,
      latitude: a.latitude,
      longitude: a.longitude,
      formattedAddress: a.formattedAddress,
      placeId: a.placeId,
      isVenuePlaceId: a.isVenuePlaceId,
      geocodeSource: a.geocodeSource
    }))
  }

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved geocoded activities to ${args.jsonOutput}`)
    }
  } else {
    displayActivities(geocodeResult.activities, logger, args.showAll, args.maxResults)
  }
}

function displayActivities(
  activities: readonly GeocodedActivity[],
  logger: Logger,
  showAll: boolean,
  maxResults: number
): void {
  // Show only geocoded activities
  const geocoded = filterGeocoded(activities)

  if (geocoded.length === 0) {
    logger.log('\n📍 Geocoded Activities: none')
    return
  }

  logger.log('\n📍 Geocoded Activities:')
  logger.log('')

  const displayCount = showAll ? geocoded.length : Math.min(maxResults, geocoded.length)

  for (let i = 0; i < displayCount; i++) {
    const a = geocoded[i]
    if (!a) continue

    const { line1, line2 } = formatActivityHeader(i, a)
    logger.log(line1)
    logger.log(line2)

    // Show coordinates
    if (a.latitude !== undefined && a.longitude !== undefined) {
      logger.log(`   📍 ${a.latitude.toFixed(4)}, ${a.longitude.toFixed(4)}`)
    }

    // Show formatted address if available
    if (a.formattedAddress) {
      logger.log(`   🏠 ${truncate(a.formattedAddress, 60)}`)
    }

    // Show geocode source
    if (a.geocodeSource) {
      const sourceLabel =
        a.geocodeSource === 'google_maps_url'
          ? 'Maps URL'
          : a.geocodeSource === 'google_geocoding'
            ? 'Address'
            : 'Place search'
      logger.log(`   🔍 Source: ${sourceLabel}`)
    }

    logger.log('')
  }

  if (!showAll && geocoded.length > maxResults) {
    logger.log(`   ... and ${geocoded.length - maxResults} more (use --all to show all)`)
  }
}
