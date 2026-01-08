/**
 * CLI Helpers
 *
 * Shared utilities for CLI commands.
 */

import { basename } from 'node:path'
import { VERSION } from '../index'
import { type ActivityCategory, type ActivityMessage, CATEGORY_EMOJI } from '../types'
import type { CLIArgs } from './args'
import { type Config, loadConfig } from './config'
import type { Logger } from './logger'
import { initContext, type PipelineContext } from './steps/context'
import { type ParseResult, stepParse } from './steps/parse'

// ============================================================================
// Category Display
// ============================================================================

export function getCategoryEmoji(category: ActivityCategory): string {
  return CATEGORY_EMOJI[category] || '📍'
}

// ============================================================================
// Formatting
// ============================================================================

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

/**
 * Output format for messages in JSON exports.
 */
export interface OutputMessage {
  id: number
  sender: string
  timestamp: string
  message: string
}

/**
 * Convert ActivityMessage array to JSON output format.
 * Shared between classify and geocode commands.
 */
export function toOutputMessages(messages: readonly ActivityMessage[]): OutputMessage[] {
  return messages.map((m) => ({
    id: m.id,
    sender: m.sender,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
    message: m.message
  }))
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

// ============================================================================
// Command Initialization
// ============================================================================

interface CommandInitResult {
  ctx: PipelineContext
  config: Config | null
  parseResult: ParseResult
}

interface CommandInitContextOnly {
  ctx: PipelineContext
  config: Config | null
}

/**
 * Shared init logic: validate input, log header, create context.
 */
async function initContextWithHeader(
  commandName: string,
  args: CLIArgs,
  logger: Logger
): Promise<PipelineContext> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap ${commandName} v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  return initContext(args.input, logger, {
    cacheDir: args.cacheDir,
    noCache: args.noCache,
    maxMessages: args.maxMessages
  })
}

/**
 * Initialize a command: validate input, log header, create context, parse messages.
 * Use this for commands that manually run steps.
 */
export async function initCommand(
  commandName: string,
  args: CLIArgs,
  logger: Logger
): Promise<CommandInitResult> {
  const ctx = await initContextWithHeader(commandName, args, logger)
  const config = await loadConfig(args.configFile)
  const parseResult = stepParse(ctx, { maxMessages: args.maxMessages })
  return { ctx, config, parseResult }
}

/**
 * Initialize a command context only (no parsing).
 * Use this for commands that use StepRunner for all step execution.
 */
export async function initCommandContext(
  commandName: string,
  args: CLIArgs,
  logger: Logger
): Promise<CommandInitContextOnly> {
  const ctx = await initContextWithHeader(commandName, args, logger)
  const config = await loadConfig(args.configFile)
  return { ctx, config }
}

// ============================================================================
// Embedding Progress Logger
// ============================================================================

/**
 * Create a batch progress logger for embedding operations.
 * Logs every 10th batch or the last batch.
 */
export function createEmbeddingProgressLogger(logger: Logger, verb: string) {
  return (info: { batchIndex: number; totalBatches: number }) => {
    const batchNum = info.batchIndex + 1
    if (batchNum % 10 === 0 || batchNum === info.totalBatches) {
      const percent = Math.floor((batchNum / info.totalBatches) * 100)
      logger.log(`   ${percent}% ${verb} (${batchNum}/${info.totalBatches} batches)`)
    }
  }
}

// ============================================================================
// Activity Display
// ============================================================================

interface ActivityLike {
  readonly activity: string
  readonly category: ActivityCategory
  readonly messages: readonly { sender: string; timestamp: Date }[]
}

/**
 * Format activity header lines (emoji, activity text, category/sender/date).
 * Returns the formatted lines for logging.
 */
export function formatActivityHeader(
  index: number,
  activity: ActivityLike
): { line1: string; line2: string } {
  const emoji = getCategoryEmoji(activity.category)
  const activityText = truncate(activity.activity, 60)
  const category = activity.category.charAt(0).toUpperCase() + activity.category.slice(1)
  const firstMessage = activity.messages[0]
  const mentionCount = activity.messages.length

  const mentionSuffix = mentionCount > 1 ? ` (x${mentionCount})` : ''

  return {
    line1: `${index + 1}. ${emoji}  "${activityText}"${mentionSuffix}`,
    line2: `   → ${category} • ${firstMessage?.sender ?? 'Unknown'} • ${formatDate(firstMessage?.timestamp ?? new Date())}`
  }
}
