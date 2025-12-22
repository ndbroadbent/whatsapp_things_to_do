/**
 * Parse Command
 *
 * Parse and validate a chat export with pipeline caching.
 */

import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { PipelineCache } from '../../cache/pipeline.js'
import { detectChatSource, parseChatWithStats, VERSION } from '../../index.js'
import type { ParsedMessage } from '../../types.js'
import type { CLIArgs } from '../args.js'
import { ensureDir, readInputFile } from '../io.js'
import type { Logger } from '../logger.js'

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

/**
 * Get unique senders from messages.
 */
function getSenders(messages: readonly ParsedMessage[]): string[] {
  const senders = new Set<string>()
  for (const msg of messages) {
    senders.add(msg.sender)
  }
  return [...senders]
}

/**
 * Count messages with URLs.
 */
function countUrls(messages: readonly ParsedMessage[]): number {
  return messages.filter((m) => m.urls && m.urls.length > 0).length
}

export async function cmdParse(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap v${VERSION}`)

  // Initialize pipeline cache
  const cacheDir = join(homedir(), '.cache', 'chat-to-map')
  const pipelineCache = new PipelineCache(cacheDir)

  // Read input
  const content = await readInputFile(args.input)
  const source = detectChatSource(content)
  const run = pipelineCache.getOrCreateRun(args.input, content)

  logger.log(`\n📂 Cache: ${basename(run.runDir)}`)

  let messages: ParsedMessage[]

  // Check for cached messages
  if (pipelineCache.hasStage('messages')) {
    messages = pipelineCache.getStage<ParsedMessage[]>('messages') ?? []
    logger.log('\n📝 Parsing messages... 📦 cached')
  } else {
    // Parse fresh
    logger.log('\n📝 Parsing messages...')
    const result = parseChatWithStats(content)

    if (result.messageCount === 0) {
      logger.error('No messages found - invalid or empty export')
      process.exit(1)
    }

    messages = args.maxMessages
      ? [...result.messages.slice(0, args.maxMessages)]
      : [...result.messages]

    // Cache the parsed messages
    pipelineCache.setStage('messages', messages)

    if (args.maxMessages !== undefined) {
      logger.log(`   (limited to first ${args.maxMessages} messages for testing)`)
    }
  }

  // Output stats (always show, cached or not)
  const senders = getSenders(messages)
  const urlCount = countUrls(messages)
  const startDate = messages[0]?.timestamp
  const endDate = messages[messages.length - 1]?.timestamp

  logger.success(`Valid ${formatSource(source)} export`)
  logger.success(`${messages.length.toLocaleString()} messages`)

  if (startDate && endDate) {
    const start = new Date(startDate).toISOString().split('T')[0]
    const end = new Date(endDate).toISOString().split('T')[0]
    logger.success(`Date range: ${start} to ${end}`)
  }

  logger.success(
    `${senders.length} participant${senders.length !== 1 ? 's' : ''}: ${formatParticipants(senders)}`
  )

  if (urlCount > 0) {
    logger.success(`${urlCount} messages contain URLs`)
  }

  // Save to JSON if requested via --json
  if (args.jsonOutput) {
    if (args.jsonOutput === 'stdout') {
      console.log(JSON.stringify(messages, null, 2))
    } else {
      await ensureDir(dirname(args.jsonOutput))
      await writeFile(args.jsonOutput, JSON.stringify(messages, null, 2))
      logger.success(`Saved to ${args.jsonOutput}`)
    }
  }
}
