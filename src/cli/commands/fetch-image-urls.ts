/**
 * Fetch Image URLs Command
 *
 * Fetch image URLs for geocoded activities from various sources:
 * - CDN default images (category/action based)
 * - Pixabay (generic activities)
 * - Google Places Photos (venues with placeId)
 *
 * Runs: parse → scan → embed → filter → scrape-urls → classify → geocode → fetch-image-urls
 */

import { writeFile } from 'node:fs/promises'
import type { ImageResult } from '../../images/types'
import type { GeocodedActivity } from '../../types'
import type { CLIArgs } from '../args'
import { formatActivityHeader, initCommandContext } from '../helpers'
import type { Logger } from '../logger'
import { stepFetchImageUrls } from '../steps/fetch-image-urls'
import { StepRunner } from '../steps/runner'

interface FetchImagesOutput {
  activitiesProcessed: number
  imagesFound: number
  fromCdn: number
  fromWikipedia: number
  fromPixabay: number
  fromGooglePlaces: number
  fromUserUpload: number
  failed: number
  activities: Array<{
    activityId: string
    activity: string
    category: string
    venue: string | null
    city: string | null
    country: string | null
    image: ImageResult | null
  }>
}

export async function cmdFetchImageUrls(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, config } = await initCommandContext('Fetch Image URLs', args, logger)

  // Use StepRunner to handle dependencies: geocode → fetch-image-urls
  const runner = new StepRunner(ctx, args, config, logger)

  // Run geocode step (which runs the full pipeline up to geocode)
  const { activities: geocodedActivities } = await runner.run('geocode')

  logger.log(`   Geocoded ${geocodedActivities.length} activities`)

  if (geocodedActivities.length === 0) {
    logger.log('\n⚠️  No activities geocoded. Nothing to fetch images for.')
    return
  }

  // Dry run: show stats and exit
  if (args.dryRun) {
    logger.log('\n📊 Image Fetch Estimate (dry run)')
    logger.log(`   Activities: ${geocodedActivities.length}`)
    const sources: string[] = []
    if (!args.skipCdn) sources.push('CDN')
    if (!args.skipWikipedia) sources.push('Wikipedia')
    if (!args.skipPixabay && process.env.PIXABAY_API_KEY) sources.push('Pixabay')
    if (!args.skipGooglePlaces && process.env.GOOGLE_MAPS_API_KEY) sources.push('Google Places')
    logger.log(`   Sources: ${sources.join(', ') || 'none'}`)
    return
  }

  // Run fetch-image-urls step
  const fetchResult = await stepFetchImageUrls(ctx, geocodedActivities, {
    skipCdn: args.skipCdn,
    skipPixabay: args.skipPixabay,
    skipWikipedia: args.skipWikipedia,
    skipGooglePlaces: args.skipGooglePlaces
  })

  // Summary
  logger.log('\n📊 Image Fetch Results')
  logger.log(`   Processed: ${fetchResult.stats.activitiesProcessed}`)
  logger.log(`   Found: ${fetchResult.stats.imagesFound}`)
  if (fetchResult.stats.fromCdn > 0) logger.log(`   From CDN: ${fetchResult.stats.fromCdn}`)
  if (fetchResult.stats.fromUserUpload > 0)
    logger.log(`   From user uploads: ${fetchResult.stats.fromUserUpload}`)
  if (fetchResult.stats.fromWikipedia > 0)
    logger.log(`   From Wikipedia: ${fetchResult.stats.fromWikipedia}`)
  if (fetchResult.stats.fromPixabay > 0)
    logger.log(`   From Pixabay: ${fetchResult.stats.fromPixabay}`)
  if (fetchResult.stats.fromGooglePlaces > 0)
    logger.log(`   From Google Places: ${fetchResult.stats.fromGooglePlaces}`)
  if (fetchResult.stats.failed > 0) logger.log(`   Not found: ${fetchResult.stats.failed}`)

  const output: FetchImagesOutput = {
    ...fetchResult.stats,
    activities: geocodedActivities.map((a) => ({
      activityId: a.activityId,
      activity: a.activity,
      category: a.category,
      venue: a.venue,
      city: a.city,
      country: a.country,
      image: fetchResult.images.get(a.activityId) ?? null
    }))
  }

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved activities with images to ${args.jsonOutput}`)
    }
  } else {
    displayActivities(geocodedActivities, fetchResult.images, logger, args.showAll, args.maxResults)
  }
}

function displayActivities(
  activities: readonly GeocodedActivity[],
  images: Map<string, ImageResult | null>,
  logger: Logger,
  showAll: boolean,
  maxResults: number
): void {
  if (activities.length === 0) {
    logger.log('\n🖼️  Activities with Images: none')
    return
  }

  logger.log('\n🖼️  Activities with Images:')
  logger.log('')

  const displayCount = showAll ? activities.length : Math.min(maxResults, activities.length)

  for (let i = 0; i < displayCount; i++) {
    const a = activities[i]
    if (!a) continue

    const image = images.get(a.activityId)
    const { line1, line2 } = formatActivityHeader(i, a)

    logger.log(line1)
    logger.log(line2)

    if (image) {
      const queryInfo = image.query ? ` (query: "${image.query}")` : ''
      logger.log(`   🖼️  ${image.source}${queryInfo}: ${image.url}`)
      if (image.attribution) {
        logger.log(`   📝 ${image.attribution.name}`)
      }
    } else {
      logger.log(`   ⚠️  No image found`)
    }

    logger.log('')
  }

  if (!showAll && activities.length > maxResults) {
    logger.log(`   ... and ${activities.length - maxResults} more (use --all to show all)`)
  }
}
