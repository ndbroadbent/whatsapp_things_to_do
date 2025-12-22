/**
 * Preview Command
 *
 * AI-powered preview of top activity candidates.
 */

import { basename } from 'node:path'
import { FilesystemCache } from '../../cache/filesystem'
import { buildClassificationPrompt } from '../../classifier/prompt'
import { classifyMessages, VERSION } from '../../index'
import { scrapeAndEnrichCandidates } from '../../scraper/enrich'
import { formatLocation } from '../../types'
import type { CLIArgs } from '../args'
import { formatDate, getCategoryEmoji, runQuickScanWithLogs, truncate } from '../helpers'
import type { Logger } from '../logger'
import { resolveContext, resolveModelConfig } from '../model'
import { getCacheDir } from '../steps/context'

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

  const { provider, apiModel: model, apiKey } = resolveModelConfig()
  const { homeCountry, timezone } = resolveContext(args.homeCountry, args.timezone)

  const PREVIEW_CLASSIFY_COUNT = args.maxResults * 3
  const topCandidates = scanResult.candidates.slice(0, PREVIEW_CLASSIFY_COUNT)

  logger.log(`\n🔍 Quick scan found ${scanResult.stats.totalUnique} potential activities`)

  const cacheDir = getCacheDir(args.cacheDir)
  const cache = new FilesystemCache(cacheDir)

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
    const prompt = buildClassificationPrompt(enrichedCandidates, { homeCountry, timezone })
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
      model,
      homeCountry,
      timezone,
      batchSize: 30,
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

  const activities = classifyResult.value.slice(0, args.maxResults)

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
    const location = formatLocation(s)
    if (location) {
      logger.log(`   📍 ${location}`)
    }
    logger.log('')
  }

  logger.log(`💡 Run 'chat-to-map analyze ${basename(args.input)}' for full analysis`)
}
