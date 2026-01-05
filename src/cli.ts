#!/usr/bin/env node
/**
 * ChatToMap CLI
 *
 * Local orchestrator for the core library.
 * Handles file I/O, parallelization, progress reporting, and rate limiting.
 *
 * @license AGPL-3.0
 */

import { parseCliArgs } from './cli/args'
import { cmdAnalyze } from './cli/commands/analyze'
import { cmdClassify } from './cli/commands/classify'
import { cmdConfig } from './cli/commands/config'
import { cmdEmbed } from './cli/commands/embed'
import { cmdExport } from './cli/commands/export'
import { cmdFetchImageUrls } from './cli/commands/fetch-image-urls'
import { cmdFetchImages } from './cli/commands/fetch-images'
import { cmdFilter } from './cli/commands/filter'
import { cmdList } from './cli/commands/list'
import { cmdParse } from './cli/commands/parse'
import { cmdPlaceLookup } from './cli/commands/place-lookup'
import { cmdPreview } from './cli/commands/preview'
import { cmdResolveLinks } from './cli/commands/resolve-links'
import { cmdScan } from './cli/commands/scan'
import { cmdScrapeUrls } from './cli/commands/scrape-urls'
import { createLogger } from './cli/logger'

async function main(): Promise<void> {
  const args = parseCliArgs()
  const logger = createLogger(args.quiet, args.verbose)

  try {
    switch (args.command) {
      case 'analyze':
      case 'export':
        await cmdAnalyze(args, logger)
        break

      case 'export-pdf':
      case 'export-json':
      case 'export-csv':
      case 'export-excel':
      case 'export-map':
        await cmdExport(args, logger)
        break

      case 'parse':
        await cmdParse(args, logger)
        break

      case 'scan':
        await cmdScan(args, logger)
        break

      case 'preview':
        await cmdPreview(args, logger)
        break

      case 'embed':
        await cmdEmbed(args, logger)
        break

      case 'filter':
        await cmdFilter(args, logger)
        break

      case 'scrape-urls':
        await cmdScrapeUrls(args, logger)
        break

      case 'classify':
        await cmdClassify(args, logger)
        break

      case 'place-lookup':
        await cmdPlaceLookup(args, logger)
        break

      case 'resolve-links':
        await cmdResolveLinks(args, logger)
        break

      case 'fetch-image-urls':
        await cmdFetchImageUrls(args, logger)
        break

      case 'fetch-images':
        await cmdFetchImages(args, logger)
        break

      case 'list':
        await cmdList(args.outputDir, logger)
        break

      case 'config':
        await cmdConfig(args, logger)
        break

      default:
        logger.error(`Unknown command: ${args.command}. Run 'chat-to-map --help' for usage.`)
        process.exit(1)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    logger.error(msg)
    if (args.verbose && error instanceof Error && error.stack) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

main()
