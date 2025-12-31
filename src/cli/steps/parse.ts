/**
 * Parse Step
 *
 * Parse chat content into messages with pipeline caching.
 */

import { detectChatSource, parseChatWithStats } from '../../index'
import type { ChatSource, ParsedMessage } from '../../types'
import type { PipelineContext } from './context'

/**
 * Result of the parse step.
 */
export interface ParseResult {
  /** Parsed messages */
  readonly messages: readonly ParsedMessage[]
  /** Detected chat source (whatsapp or imessage) */
  readonly source: ChatSource
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Stats for display */
  readonly stats: {
    readonly messageCount: number
    readonly senderCount: number
    readonly urlCount: number
    readonly dateRange: { start: Date; end: Date }
    readonly senders: readonly string[]
  }
}

/**
 * Parse step options.
 */
interface ParseOptions {
  /** Limit messages (for testing) */
  readonly maxMessages?: number | undefined
  /** Skip logging */
  readonly quiet?: boolean | undefined
}

/**
 * Run the parse step.
 *
 * Checks pipeline cache first, parses fresh if needed.
 */
export function stepParse(ctx: PipelineContext, options?: ParseOptions): ParseResult {
  const { pipelineCache, content, logger, skipPipelineCache } = ctx
  const source = detectChatSource(content)

  // Check cache (skip if skipPipelineCache - e.g. --max-messages or --no-cache)
  if (!skipPipelineCache && pipelineCache.hasStage('messages')) {
    const messages = pipelineCache.getStage<ParsedMessage[]>('messages') ?? []
    const stats =
      pipelineCache.getStage<ParseResult['stats']>('parse_stats') ?? computeStats(messages)
    if (!options?.quiet) {
      logger.log('\n📝 Parsing messages... 📦 cached')
    }
    return { messages, source, fromCache: true, stats }
  }

  // Parse fresh
  if (!options?.quiet) {
    logger.log('\n📝 Parsing messages...')
  }

  const result = parseChatWithStats(content)

  if (result.messageCount === 0) {
    throw new Error('No messages found - invalid or empty export')
  }

  const messages = options?.maxMessages
    ? [...result.messages.slice(0, options.maxMessages)]
    : [...result.messages]

  const stats: ParseResult['stats'] = {
    messageCount: result.messageCount,
    senderCount: result.senders.length,
    urlCount: result.urlCount,
    dateRange: result.dateRange,
    senders: result.senders
  }

  // Cache messages and stats
  pipelineCache.setStage('messages', messages)
  pipelineCache.setStage('parse_stats', stats)

  if (options?.maxMessages !== undefined && !options?.quiet) {
    logger.log(`   (limited to first ${options.maxMessages} messages for testing)`)
  }

  return {
    messages,
    source,
    fromCache: false,
    stats
  }
}

/**
 * Compute stats from messages (for cached results).
 */
function computeStats(messages: readonly ParsedMessage[]): ParseResult['stats'] {
  const senders = new Set<string>()
  let urlCount = 0

  for (const msg of messages) {
    senders.add(msg.sender)
    if (msg.urls && msg.urls.length > 0) {
      urlCount++
    }
  }

  const startDate = messages[0]?.timestamp ?? new Date()
  const endDate = messages[messages.length - 1]?.timestamp ?? new Date()

  return {
    messageCount: messages.length,
    senderCount: senders.size,
    urlCount,
    dateRange: {
      start: new Date(startDate),
      end: new Date(endDate)
    },
    senders: [...senders]
  }
}
