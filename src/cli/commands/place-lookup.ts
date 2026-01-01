/**
 * Place Lookup Command
 *
 * Looks up places for classified activities using Google Maps API.
 * Runs: parse → scan → embed → filter → scrape → classify → place-lookup
 */

import { writeFile } from 'node:fs/promises'
import { calculatePlacesLookupCost, formatMicrosAsDollars } from '../../costs'
import { filterWithCoordinates } from '../../place-lookup/index'
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
import { stepPlaceLookup } from '../steps/place-lookup'
import { StepRunner } from '../steps/runner'

interface PlaceLookupOutput {
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
    placeName: string | null
    placeQuery: string | null
    city: string | null
    country: string | null
    latitude: number | undefined
    longitude: number | undefined
    formattedAddress: string | undefined
    placeId: string | undefined
    isVenuePlaceId: boolean | undefined
    placeLookupSource: string | undefined
  }>
}

export async function cmdPlaceLookup(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, config } = await initCommandContext('Place Lookup', args, logger)

  // Use StepRunner to handle dependencies: classify → place-lookup
  const runner = new StepRunner(ctx, args, config, logger)

  // Run classify step (which runs parse → scan → embed → filter → scrape → classify)
  const { activities: classifiedActivities } = await runner.run('classify')

  logger.log(`   Classified ${classifiedActivities.length} activities`)

  if (classifiedActivities.length === 0) {
    logger.log('\n⚠️  No activities classified. Nothing to look up.')
    return
  }

  // Dry run: show stats and exit
  if (args.dryRun) {
    const withLocation = classifiedActivities.filter((a) => formatLocation(a)).length
    // Estimate cost: worst case all activities need place search
    const estimatedCostMicros = calculatePlacesLookupCost(classifiedActivities.length)

    logger.log('\n📊 Place Lookup Estimate (dry run)')
    logger.log(`   Activities to look up: ${classifiedActivities.length}`)
    logger.log(`   With location info: ${withLocation}`)
    logger.log(`   Without location: ${classifiedActivities.length - withLocation}`)
    logger.log(`   Estimated cost (max): ${formatMicrosAsDollars(estimatedCostMicros)}`)
    return
  }

  // Run place lookup step
  const lookupResult = await stepPlaceLookup(ctx, classifiedActivities, {
    homeCountry: args.homeCountry
  })

  // Summary
  logger.log('\n📊 Place Lookup Results')
  logger.log(`   Processed: ${lookupResult.stats.activitiesProcessed}`)
  logger.log(`   Located: ${lookupResult.stats.activitiesGeocoded}`)
  if (lookupResult.stats.fromGoogleMapsUrl > 0) {
    logger.log(`   From Maps URLs: ${lookupResult.stats.fromGoogleMapsUrl}`)
  }
  if (lookupResult.stats.fromGoogleGeocoding > 0) {
    logger.log(`   From address: ${lookupResult.stats.fromGoogleGeocoding}`)
  }
  if (lookupResult.stats.fromPlaceSearch > 0) {
    logger.log(`   From place search: ${lookupResult.stats.fromPlaceSearch}`)
  }
  if (lookupResult.stats.failed > 0) {
    logger.log(`   Failed: ${lookupResult.stats.failed}`)
  }

  const output: PlaceLookupOutput = {
    activitiesProcessed: lookupResult.stats.activitiesProcessed,
    activitiesGeocoded: lookupResult.stats.activitiesGeocoded,
    fromGoogleMapsUrl: lookupResult.stats.fromGoogleMapsUrl,
    fromGoogleGeocoding: lookupResult.stats.fromGoogleGeocoding,
    fromPlaceSearch: lookupResult.stats.fromPlaceSearch,
    failed: lookupResult.stats.failed,
    activities: lookupResult.activities.map((a) => ({
      activity: a.activity,
      category: a.category,
      messages: toOutputMessages(a.messages),
      mentionCount: a.messages.length,
      placeName: a.placeName,
      placeQuery: a.placeQuery,
      city: a.city,
      country: a.country,
      latitude: a.latitude,
      longitude: a.longitude,
      formattedAddress: a.formattedAddress,
      placeId: a.placeId,
      isVenuePlaceId: a.isVenuePlaceId,
      placeLookupSource: a.placeLookupSource
    }))
  }

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved place lookup results to ${args.jsonOutput}`)
    }
  } else {
    displayActivities(lookupResult.activities, logger, args.showAll, args.maxResults)
  }
}

function displayActivities(
  activities: readonly GeocodedActivity[],
  logger: Logger,
  showAll: boolean,
  maxResults: number
): void {
  // Show only geocoded activities
  const geocoded = filterWithCoordinates(activities)

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

    // Show place lookup source
    if (a.placeLookupSource) {
      const sourceLabel =
        a.placeLookupSource === 'google_maps_url'
          ? 'Maps URL'
          : a.placeLookupSource === 'geocoding_api'
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
