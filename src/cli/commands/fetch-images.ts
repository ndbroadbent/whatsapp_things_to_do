/**
 * Fetch Images Command
 *
 * Download images and resize to thumbnails for PDF export.
 *
 * Runs: parse → scan → embed → filter → scrape-urls → classify → geocode → fetch-image-urls → fetch-images
 */

import type { CLIArgs } from '../args'
import { initCommandContext } from '../helpers'
import type { Logger } from '../logger'
import { StepRunner } from '../steps/runner'

export async function cmdFetchImages(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, config } = await initCommandContext('Fetch Images', args, logger)

  const runner = new StepRunner(ctx, args, config, logger)

  // Run fetchImages step (which runs the full pipeline including fetchImageUrls)
  const { thumbnails } = await runner.run('fetchImages')

  // Summary
  logger.log('\n📊 Thumbnail Results')
  logger.log(`   Fetched: ${thumbnails.size} thumbnails`)

  // Display thumbnails
  if (thumbnails.size === 0) {
    logger.log('\n🖼️  Thumbnails: none')
    return
  }

  logger.log('\n🖼️  Thumbnails:')

  const displayCount = args.showAll ? thumbnails.size : Math.min(args.maxResults, thumbnails.size)
  let count = 0

  for (const [activityId, buffer] of thumbnails) {
    if (count >= displayCount) break
    const sizeKB = (buffer.length / 1024).toFixed(1)
    logger.log(`   ${activityId}: ${sizeKB} KB`)
    count++
  }

  if (!args.showAll && thumbnails.size > args.maxResults) {
    logger.log(`   ... and ${thumbnails.size - args.maxResults} more (use --all to show all)`)
  }
}
