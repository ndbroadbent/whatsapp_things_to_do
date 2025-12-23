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
import { cmdEmbed } from './cli/commands/embed'
import { cmdFetchImages } from './cli/commands/fetch-images'
import { cmdFilter } from './cli/commands/filter'
import { cmdList } from './cli/commands/list'
import { cmdParse } from './cli/commands/parse'
import { cmdPreview } from './cli/commands/preview'
import { cmdScan } from './cli/commands/scan'
import { cmdScrape } from './cli/commands/scrape'
import { createLogger } from './cli/logger'

async function main(): Promise<void> {
  const args = parseCliArgs()
  const logger = createLogger(args.quiet, args.verbose)

  try {
    switch (args.command) {
      case 'analyze':
        await cmdAnalyze(args, logger)
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

      case 'scrape':
        await cmdScrape(args, logger)
        break

      case 'fetch-images':
        await cmdFetchImages(args, logger)
        break

      case 'list':
        await cmdList(args.outputDir, logger)
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
