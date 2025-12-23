/**
 * Scrape Command
 *
 * Scrape URLs from candidates and enrich with metadata.
 * Caches results to pipeline cache for subsequent steps.
 */

import { writeFile } from 'node:fs/promises'
import { extractUrlsFromCandidates } from '../../scraper/enrich'
import type { ScrapedMetadata } from '../../scraper/types'
import type { CandidateMessage } from '../../types'
import type { CLIArgs } from '../args'
import { initCommand, truncate } from '../helpers'
import type { Logger } from '../logger'
import { stepScan } from '../steps/scan'
import { stepScrape } from '../steps/scrape'

interface ScrapeOutput {
  urlCount: number
  successCount: number
  failedCount: number
  cachedCount: number
  enrichedCandidates: readonly CandidateMessage[]
}

/** URL metadata extracted from enriched context */
interface ExtractedMeta {
  title: string
  platform: string
  description: string | null
}

const URL_META_REGEX = /\[URL_META: ({.*?})\]/g

/**
 * Extract all URL metadata from candidates.
 */
function extractAllUrlMeta(candidates: readonly CandidateMessage[]): ExtractedMeta[] {
  const results: ExtractedMeta[] = []

  for (const candidate of candidates) {
    if (!candidate.context) continue
    const matches = [...candidate.context.matchAll(URL_META_REGEX)]
    for (const match of matches) {
      const parsed = parseUrlMeta(match[1])
      if (parsed) results.push(parsed)
    }
  }

  return results
}

/**
 * Parse a single URL_META JSON string.
 */
function parseUrlMeta(jsonStr: string | undefined): ExtractedMeta | null {
  if (!jsonStr) return null
  try {
    const meta = JSON.parse(jsonStr) as Partial<ScrapedMetadata>
    return {
      title: meta.title ? truncate(meta.title, 60) : '(no title)',
      platform: meta.platform ?? 'unknown',
      description: meta.description ? truncate(meta.description, 80) : null
    }
  } catch {
    return null
  }
}

/**
 * Format scraped URL metadata for display.
 */
function formatScrapeResults(
  candidates: readonly CandidateMessage[],
  logger: Logger,
  showAll: boolean
): void {
  logger.log('\n📋 Enriched URLs:')
  logger.log('')

  const allMeta = extractAllUrlMeta(candidates)
  const displayCount = showAll ? allMeta.length : Math.min(10, allMeta.length)

  for (let i = 0; i < displayCount; i++) {
    const meta = allMeta[i]
    if (!meta) continue
    logger.log(`${i + 1}. ${meta.title}`)
    logger.log(`   Platform: ${meta.platform}`)
    if (meta.description) {
      logger.log(`   ${meta.description}`)
    }
    logger.log('')
  }

  if (allMeta.length === 0) {
    logger.log('   No URL metadata found')
  } else if (!showAll && allMeta.length > 10) {
    logger.log(`   ... and ${allMeta.length - 10} more (use --all to show all)`)
  }
}

export async function cmdScrape(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx } = await initCommand('Scrape', args, logger)

  // Get candidates from scan step
  const scanResult = stepScan(ctx, {
    minConfidence: args.minConfidence,
    maxMessages: args.maxMessages,
    quiet: true
  })

  const urls = extractUrlsFromCandidates(scanResult.candidates)
  logger.log(`   Found ${scanResult.candidates.length} candidates with ${urls.length} URLs`)

  // Dry run: show stats and exit
  if (args.dryRun) {
    logger.log('\n📊 Scrape Estimate (dry run)')
    logger.log(`   URLs to scrape: ${urls.length}`)
    logger.log(`   Estimated time: ~${Math.ceil(urls.length * 0.5)}s (with rate limiting)`)
    return
  }

  // Run scrape step
  const scrapeResult = await stepScrape(ctx, scanResult.candidates, {
    timeout: args.scrapeTimeout,
    verbose: args.verbose
  })

  logger.log('\n📊 Scrape Results')
  logger.log(`   Total URLs: ${scrapeResult.stats.urlCount}`)
  logger.log(
    `   Successful: ${scrapeResult.stats.successCount} (${scrapeResult.stats.cachedCount} cached)`
  )
  logger.log(`   Failed: ${scrapeResult.stats.failedCount}`)

  const output: ScrapeOutput = {
    urlCount: scrapeResult.stats.urlCount,
    successCount: scrapeResult.stats.successCount,
    failedCount: scrapeResult.stats.failedCount,
    cachedCount: scrapeResult.stats.cachedCount,
    enrichedCandidates: scrapeResult.candidates
  }

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved scrape results to ${args.jsonOutput}`)
    }
  } else {
    formatScrapeResults(scrapeResult.candidates, logger, args.showAll)
  }
}
