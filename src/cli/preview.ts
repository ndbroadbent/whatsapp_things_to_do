/**
 * CLI Preview and Scan Helpers
 *
 * Shared utilities for preview and scan commands.
 */

import { quickScan } from '../index.js'
import { type ActivityCategory, CATEGORY_EMOJI } from '../types.js'
import { readInputFile } from './io.js'
import type { Logger } from './logger.js'

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
// Quick Scan with Logging
// ============================================================================

export interface QuickScanOutput {
  scanResult: ReturnType<typeof quickScan>
  hasNoCandidates: boolean
}

export interface QuickScanWithLogsOptions {
  maxMessages?: number | undefined
}

export async function runQuickScanWithLogs(
  input: string,
  logger: Logger,
  options?: QuickScanWithLogsOptions
): Promise<QuickScanOutput> {
  const content = await readInputFile(input)
  const scanResult = quickScan(content, { maxMessages: options?.maxMessages })

  const startDate = formatDate(scanResult.dateRange.start)
  const endDate = formatDate(scanResult.dateRange.end)
  logger.log(
    `   ${scanResult.messageCount.toLocaleString()} messages from ${scanResult.senderCount} senders`
  )
  logger.log(`   Date range: ${startDate} to ${endDate}`)

  if (options?.maxMessages !== undefined) {
    logger.log(`   (limited to first ${options.maxMessages} messages for testing)`)
  }

  if (scanResult.candidates.length === 0) {
    logger.log('\n⚠️  No activity suggestions found in this chat.')
    return { scanResult, hasNoCandidates: true }
  }

  return { scanResult, hasNoCandidates: false }
}
