/**
 * CLI Scrape Command
 *
 * Scrape URLs from candidates and cache metadata.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { FilesystemCache } from '../cache/filesystem.js'
import { extractCandidatesByHeuristics, VERSION } from '../index.js'
import { extractUrlsFromCandidates } from '../scraper/enrich.js'
import { scrapeUrl } from '../scraper/index.js'
import type { ScrapedMetadata } from '../scraper/types.js'
import type { CandidateMessage } from '../types.js'
import type { CLIArgs } from './args.js'
import type { Logger } from './logger.js'
import { runParse } from './pipeline.js'
import { truncate } from './preview.js'

interface ScrapeResult {
  url: string
  metadata: ScrapedMetadata | null
  cached?: boolean
  error?: string
}

interface ScrapeOutput {
  urlCount: number
  successCount: number
  failedCount: number
  cachedCount: number
  results: ScrapeResult[]
}

/** Cache TTL for scraped metadata (24 hours) */
const SCRAPE_CACHE_TTL_SECONDS = 24 * 60 * 60

function getScrapeCacheKey(url: string): string {
  return `scrape:${url}`
}

async function loadCandidatesForScrape(args: CLIArgs, logger: Logger): Promise<CandidateMessage[]> {
  if (args.input.endsWith('.json')) {
    logger.log('\n📋 Loading candidates from JSON...')
    const content = await readFile(args.input, 'utf-8')
    const data = JSON.parse(content) as { candidates?: CandidateMessage[] }
    const candidates = data.candidates ?? (Array.isArray(data) ? data : [])
    logger.success(`Loaded ${candidates.length} candidates`)
    return candidates
  }

  const messages = await runParse(args.input, args, logger)
  logger.log('\n🔍 Extracting candidates (heuristics only)...')
  const result = extractCandidatesByHeuristics(messages, {
    minConfidence: args.minConfidence
  })
  logger.success(`Extracted ${result.candidates.length} candidates`)
  return [...result.candidates]
}

async function scrapeUrlWithCache(
  url: string,
  timeout: number,
  cache: FilesystemCache
): Promise<ScrapeResult> {
  const cacheKey = getScrapeCacheKey(url)

  const cached = await cache.get<ScrapedMetadata>(cacheKey)
  if (cached) {
    return { url, metadata: cached.data, cached: true }
  }

  try {
    const result = await scrapeUrl(url, { timeout })

    if (result.ok) {
      await cache.set(
        cacheKey,
        { data: result.metadata, cachedAt: Date.now() },
        SCRAPE_CACHE_TTL_SECONDS
      )
      return { url, metadata: result.metadata }
    }
    return { url, metadata: null, error: result.error.message }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return { url, metadata: null, error: msg }
  }
}

function formatScrapeResults(output: ScrapeOutput, logger: Logger): void {
  logger.log('\n📋 Scraped Metadata:')
  logger.log('')

  for (const { url, metadata, error } of output.results) {
    const domain = new URL(url).hostname.replace('www.', '')
    if (metadata) {
      const title = metadata.title ? truncate(metadata.title, 60) : '(no title)'
      logger.log(`✓ ${domain}`)
      logger.log(`   ${title}`)
      if (metadata.description) {
        logger.log(`   ${truncate(metadata.description, 80)}`)
      }
      logger.log('')
    } else if (error) {
      logger.log(`✗ ${domain}: ${error}`)
      logger.log('')
    }
  }
}

export async function cmdScrape(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Scrape v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  const cacheDir = join(homedir(), '.cache', 'chat-to-map')
  const cache = new FilesystemCache(cacheDir)

  const candidates = await loadCandidatesForScrape(args, logger)
  const urls = extractUrlsFromCandidates(candidates)

  if (urls.length === 0) {
    logger.log('\n⚠️  No URLs found in candidates')
    return
  }

  logger.log(`\n🔗 Scraping ${urls.length} URLs...`)

  const results: ScrapeResult[] = []
  let successCount = 0
  let failedCount = 0
  let cachedCount = 0

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    if (!url) continue

    const result = await scrapeUrlWithCache(url, args.scrapeTimeout, cache)
    results.push(result)

    if (result.metadata) {
      successCount++
      if (result.cached) cachedCount++
    } else {
      failedCount++
    }

    if (args.verbose) {
      const domain = new URL(url).hostname.replace('www.', '')
      const prefix = `   [${i + 1}/${urls.length}]`
      if (result.cached) {
        logger.log(`${prefix} 📦 ${domain} (cached)`)
      } else if (result.metadata) {
        logger.log(`${prefix} ✓ ${domain}`)
      } else {
        logger.log(`${prefix} ✗ ${domain}: ${result.error}`)
      }
    }
  }

  const output: ScrapeOutput = {
    urlCount: urls.length,
    successCount,
    failedCount,
    cachedCount,
    results
  }

  logger.log(`\n📊 Scrape Results`)
  logger.log(`   Total URLs: ${output.urlCount}`)
  logger.log(`   Successful: ${output.successCount} (${output.cachedCount} cached)`)
  logger.log(`   Failed: ${output.failedCount}`)

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved scrape results to ${args.jsonOutput}`)
    }
  } else {
    formatScrapeResults(output, logger)
  }
}
