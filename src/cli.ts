#!/usr/bin/env node
/**
 * ChatToMap CLI
 *
 * Local orchestrator for the core library.
 * Handles file I/O, parallelization, progress reporting, and rate limiting.
 *
 * @license AGPL-3.0
 */

import { HELP_TEXT, parseCliArgs } from './cli/args.js'
import { cmdAnalyze, cmdCandidates, cmdParse, cmdPreview, cmdScan } from './cli/commands.js'
import { cmdList } from './cli/list.js'
import { createLogger } from './cli/logger.js'

async function main(): Promise<void> {
  const args = parseCliArgs()
  const logger = createLogger(args.quiet, args.verbose)

  try {
    switch (args.command) {
      case 'analyze':
        await cmdAnalyze(args, logger)
        break

      case 'preview':
        await cmdPreview(args, logger)
        break

      case 'scan':
        await cmdScan(args, logger)
        break

      case 'candidates':
        await cmdCandidates(args, logger)
        break

      case 'list':
        await cmdList(args.outputDir, logger)
        break

      case 'parse':
        await cmdParse(args, logger)
        break

      default:
        console.log(HELP_TEXT)
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
