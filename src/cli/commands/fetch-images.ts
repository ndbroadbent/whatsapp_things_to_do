/**
 * Fetch Images Command
 *
 * Fetch images for geocoded activities from various sources:
 * - Scraped OG images (already available)
 * - Pixabay (generic activities)
 * - Wikipedia (landmarks, cities)
 * - Google Places Photos (venues with placeId)
 */

import { basename } from 'node:path'
import { VERSION } from '../../index'
import type { CLIArgs } from '../args'
import type { Logger } from '../logger'

export async function cmdFetchImages(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Fetch Images v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  // TODO: Load geocoded activities from input file
  // TODO: For each activity, fetch image using fallback chain:
  //   1. Use scraped OG image if available
  //   2. Google Places Photos (if placeId exists)
  //   3. Wikipedia (if landmark/city/country)
  //   4. Pixabay (search by action, object, location)
  //   5. Category fallback (emoji/icon)

  logger.log('\n🖼️  Fetching images...')
  logger.log('   (not yet implemented)')

  logger.log('\n💡 Image fetching will be implemented in src/images/')
}
