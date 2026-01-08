/**
 * Scan Command
 *
 * Free heuristic-only scan (no API calls).
 * Chains: parse → extract
 */

import { basename } from 'node:path'
import { VERSION } from '../../index'
import type { CLIArgs } from '../args'
import type { Logger } from '../logger'
import { initContext, stepParse, stepScan } from '../steps/index'

/**
 * Format date for display.
 */
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Truncate text to max length.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

export async function cmdScan(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Scan v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  // Initialize pipeline context
  const ctx = await initContext(args.input, logger, {
    noCache: args.noCache,
    cacheDir: args.cacheDir,
    maxMessages: args.maxMessages
  })

  // Run parse step (for stats display)
  const parseResult = stepParse(ctx, { maxMessages: args.maxMessages })
  const { stats } = parseResult

  logger.log(`   ${stats.messageCount.toLocaleString()} messages from ${stats.senderCount} senders`)
  logger.log(
    `   Date range: ${formatDate(stats.dateRange.start)} to ${formatDate(stats.dateRange.end)}`
  )

  if (args.maxMessages !== undefined) {
    logger.log(`   (limited to first ${args.maxMessages} messages for testing)`)
  }

  // Run scan step
  const scanResult = stepScan(ctx, {
    maxMessages: args.maxMessages,
    minConfidence: args.minConfidence,
    quiet: true // we log our own message below
  })

  const cachedSuffix = scanResult.fromCache ? ' 📦 cached' : ''
  logger.log(
    `\n🔍 Heuristic scan found ${scanResult.stats.totalUnique} potential activities${cachedSuffix}`
  )
  logger.log(`   Regex patterns: ${scanResult.stats.regexMatches} matches`)
  logger.log(`   URL-based: ${scanResult.stats.urlMatches} matches`)

  if (scanResult.candidates.length === 0) {
    logger.log('\n⚠️  No activity suggestions found in this chat.')
    return
  }

  // Display top candidates
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
