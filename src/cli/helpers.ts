/**
 * CLI Helpers
 *
 * Shared utilities for CLI commands.
 */

import { basename } from 'node:path'
import { VERSION } from '../index'
import { type ActivityCategory, CATEGORY_EMOJI } from '../types'
import type { CLIArgs } from './args'
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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
  parseResult: ParseResult
}

/**
 * Initialize a command: validate input, log header, create context, parse messages.
 */
export async function initCommand(
  commandName: string,
  args: CLIArgs,
  logger: Logger
): Promise<CommandInitResult> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap ${commandName} v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  const ctx = await initContext(args.input, logger, {
    cacheDir: args.cacheDir,
    noCache: args.noCache
  })

  const parseResult = stepParse(ctx, { maxMessages: args.maxMessages })

  return { ctx, parseResult }
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
