/**
 * Parse Command
 *
 * Parse and validate a chat export.
 */

import { writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { VERSION } from '../../index'
import type { CLIArgs } from '../args'
import { ensureDir } from '../io'
import type { Logger } from '../logger'
import { initContext, stepParse } from '../steps/index'

/**
 * Format chat source for display.
 */
function formatSource(source: 'whatsapp' | 'imessage'): string {
  return source === 'whatsapp' ? 'WhatsApp' : 'iMessage'
}

/**
 * Format participant list, showing top 5 + "and N others" if more.
 */
function formatParticipants(senders: readonly string[]): string {
  if (senders.length <= 5) {
    return senders.join(', ')
  }
  const top5 = senders.slice(0, 5).join(', ')
  const remaining = senders.length - 5
  return `${top5}, and ${remaining} others`
}

export async function cmdParse(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap v${VERSION}`)

  // Initialize pipeline context
  const ctx = await initContext(args.input, logger, {
    noCache: args.noCache,
    cacheDir: args.cacheDir,
    maxMessages: args.maxMessages
  })

  // Run parse step
  const result = stepParse(ctx, { maxMessages: args.maxMessages })

  // Display stats
  const { stats, source } = result
  logger.success(`Valid ${formatSource(source)} export`)
  logger.success(`${stats.messageCount.toLocaleString()} messages`)

  // Dates may be strings when read from cache
  const startDate =
    typeof stats.dateRange.start === 'string'
      ? new Date(stats.dateRange.start)
      : stats.dateRange.start
  const endDate =
    typeof stats.dateRange.end === 'string' ? new Date(stats.dateRange.end) : stats.dateRange.end
  const start = startDate.toISOString().split('T')[0]
  const end = endDate.toISOString().split('T')[0]
  logger.success(`Date range: ${start} to ${end}`)

  logger.success(
    `${stats.senderCount} participant${stats.senderCount !== 1 ? 's' : ''}: ${formatParticipants(stats.senders)}`
  )

  if (stats.urlCount > 0) {
    logger.success(`${stats.urlCount} messages contain URLs`)
  }

  // Save to JSON if requested
  if (args.jsonOutput) {
    if (args.jsonOutput === 'stdout') {
      console.log(JSON.stringify(result.messages, null, 2))
    } else {
      await ensureDir(dirname(args.jsonOutput))
      await writeFile(args.jsonOutput, JSON.stringify(result.messages, null, 2))
      logger.success(`Saved to ${args.jsonOutput}`)
    }
  }
}
