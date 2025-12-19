/**
 * CLI Commands
 *
 * Individual command implementations for preview, scan, analyze, parse.
 */

import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { FilesystemCache } from '../cache/filesystem.js'
import { buildClassificationPrompt } from '../classifier/prompt.js'
import { classifyMessages, VERSION } from '../index.js'
import { scrapeAndEnrichCandidates } from '../scraper/enrich.js'
import type { ClassifierConfig } from '../types.js'
import type { CLIArgs } from './args.js'
import { ensureDir } from './io.js'
import type { Logger } from './logger.js'
import { runClassify, runExport, runExtract, runGeocode, runParse } from './pipeline.js'
import { formatDate, getCategoryEmoji, runQuickScanWithLogs, truncate } from './preview.js'

export async function cmdPreview(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Preview v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  const { scanResult, hasNoCandidates } = await runQuickScanWithLogs(args.input, logger, {
    maxMessages: args.maxMessages
  })

  if (hasNoCandidates) {
    logger.log('\n🔍 Quick scan found 0 potential activities')
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error(
      'preview command requires ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable'
    )
  }

  const provider: ClassifierConfig['provider'] = process.env.ANTHROPIC_API_KEY
    ? 'anthropic'
    : 'openai'

  const PREVIEW_CLASSIFY_COUNT = args.maxResults * 3
  const topCandidates = scanResult.candidates.slice(0, PREVIEW_CLASSIFY_COUNT)

  logger.log(`\n🔍 Quick scan found ${scanResult.stats.totalUnique} potential activities`)

  const model = provider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-5-mini'

  const cacheDir = join(homedir(), '.cache', 'chat-to-map')
  const cache = new FilesystemCache(cacheDir)

  // Scrape URLs to enrich context with metadata (parallel, cached)
  const enrichedCandidates = await scrapeAndEnrichCandidates(topCandidates, {
    timeout: 4000,
    concurrency: 5,
    cache,
    onScrapeStart: ({ urlCount }) => {
      if (urlCount > 0) {
        logger.log(`\n🔗 Scraping metadata for ${urlCount} URLs...`)
      }
    },
    onUrlScraped: ({ url, success, current, total }) => {
      if (args.debug) {
        const status = success ? '✓' : '✗'
        const domain = new URL(url).hostname.replace('www.', '')
        logger.log(`   [${current}/${total}] ${status} ${domain}`)
      }
    }
  })

  if (args.debug) {
    const prompt = buildClassificationPrompt(enrichedCandidates)
    logger.log('\n--- DEBUG: Classifier Prompt ---')
    logger.log(prompt)
    logger.log('--- END DEBUG ---\n')
    logger.log(`Prompt length: ${prompt.length} chars`)
  }

  if (args.dryRun) {
    logger.log(`\n📊 Dry run: would send ${enrichedCandidates.length} messages to ${model}`)
    return
  }

  const classifyResult = await classifyMessages(
    enrichedCandidates,
    {
      provider,
      apiKey,
      batchSize: 30,
      onCacheCheck: (info) => {
        if (args.debug) {
          const status = info.hit ? '✅ cache hit' : '❌ cache miss'
          logger.log(`   [debug] Batch ${info.batchIndex + 1}: ${status}`)
          logger.log(`   [debug] Key: ${info.cacheKey.slice(0, 16)}...`)
        }
        if (info.hit) {
          logger.log('\n📦 Using cached results...')
        }
      },
      onBatchStart: (info) => {
        if (info.totalBatches === 1) {
          logger.log(`\n🤖 Sending ${info.candidateCount} candidates to ${info.model}...`)
        } else {
          logger.log(
            `\n🤖 Batch ${info.batchIndex + 1}/${info.totalBatches}: ` +
              `sending ${info.candidateCount} candidates to ${info.model}...`
          )
        }
      }
    },
    cache
  )

  if (!classifyResult.ok) {
    throw new Error(`Classification failed: ${classifyResult.error.message}`)
  }

  const activities = classifyResult.value
    .filter((s) => s.isActivity && s.activityScore >= 0.5)
    .sort((a, b) => b.activityScore - a.activityScore)
    .slice(0, args.maxResults)

  if (activities.length === 0) {
    logger.log('   No activities found after AI classification.')
    logger.log('')
    logger.log('💡 Try running full analysis: chat-to-map analyze <input>')
    return
  }

  for (let i = 0; i < activities.length; i++) {
    const s = activities[i]
    if (!s) continue
    const emoji = getCategoryEmoji(s.category)
    const activity = truncate(s.activity, 200)
    const category = s.category.charAt(0).toUpperCase() + s.category.slice(1)

    logger.log(`${i + 1}. ${emoji}  "${activity}"`)
    logger.log(`   → ${category} • ${s.sender} • ${formatDate(s.timestamp)}`)
    if (s.location) {
      logger.log(`   📍 ${s.location}`)
    }
    logger.log('')
  }

  const totalCandidates = scanResult.stats.totalUnique
  logger.log(
    `💡 Run 'chat-to-map analyze ${basename(args.input)}' to process all ${totalCandidates} candidates`
  )
}

export async function cmdScan(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Scan v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  const { scanResult, hasNoCandidates } = await runQuickScanWithLogs(args.input, logger, {
    maxMessages: args.maxMessages
  })

  logger.log(`\n🔍 Heuristic scan found ${scanResult.stats.totalUnique} potential activities`)
  logger.log(`   Regex patterns: ${scanResult.stats.regexMatches} matches`)
  logger.log(`   URL-based: ${scanResult.stats.urlMatches} matches`)

  if (hasNoCandidates) {
    return
  }

  const candidates = scanResult.candidates.slice(0, args.maxResults)
  logger.log(`\n📋 Top ${candidates.length} candidates (by confidence):`)
  logger.log('')

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (!c) continue
    const msg = truncate(c.content, 70)
    logger.log(`${i + 1}. "${msg}"`)
    logger.log(
      `   ${c.sender} • ${formatDate(c.timestamp)} • confidence: ${c.confidence.toFixed(2)}`
    )
    logger.log('')
  }

  const remaining = scanResult.stats.totalUnique - candidates.length
  if (remaining > 0) {
    logger.log(`   ... and ${remaining} more candidates`)
    logger.log('')
  }

  logger.log(`💡 Run 'chat-to-map preview ${basename(args.input)}' for AI-powered classification`)
}

export async function cmdAnalyze(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap v${VERSION}`)
  logger.log(`\n📁 Reading: ${args.input}`)

  const messages = await runParse(args.input, args, logger)

  if (args.dryRun) {
    logger.log('\n📊 Dry run complete. No API calls made.')
    return
  }

  const candidates = runExtract(messages, args, logger)

  if (candidates.length === 0) {
    logger.log('\n⚠️  No candidates found. Nothing to process.')
    return
  }

  const suggestions = await runClassify(candidates, args, logger)

  if (suggestions.length === 0) {
    logger.log('\n⚠️  No activities found after classification.')
    return
  }

  const geocoded = await runGeocode(suggestions, args, logger)
  await runExport(geocoded, args, logger, args.input)

  const mapPath = join(args.outputDir, 'map.html')
  logger.log(`\n✨ Done! Open ${mapPath} to view your activity map.`)
}

export async function cmdParse(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  const messages = await runParse(args.input, args, logger)

  if (args.outputDir !== './output') {
    await ensureDir(dirname(args.outputDir))
    const json = JSON.stringify(messages, null, 2)
    await writeFile(args.outputDir, json)
    logger.success(`Saved to ${args.outputDir}`)
  }
}
