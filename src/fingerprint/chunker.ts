/**
 * Monthly Chunk Generator
 *
 * Groups messages by calendar month and generates fingerprints for deduplication.
 * See project_docs/CHAT_FINGERPRINTING.md for algorithm details.
 */

import { createHash } from 'node:crypto'
import type { ParsedMessage } from '../types/parser'
import type { FingerprintConfig, MonthlyChunk } from './types'

/** Default number of messages to sample from each month */
const DEFAULT_SAMPLE_SIZE = 10

/**
 * Truncate a timestamp to the minute (floor, not round).
 * This handles WhatsApp's ±1 second timestamp drift between exports.
 *
 * Using floor instead of round ensures that ±1 second drift never crosses
 * a minute boundary (e.g., 20:09:30 and 20:09:29 both become 20:09:00).
 */
export function roundToMinute(timestamp: Date): number {
  return Math.floor(timestamp.getTime() / 60000) * 60000
}

/**
 * Get the UTC month start date for a timestamp.
 * Returns the first day of the month at 00:00:00 UTC.
 */
export function getMonthStart(timestamp: Date): Date {
  return new Date(Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), 1))
}

/**
 * Get a sortable month key in "YYYY-MM" format.
 */
export function getMonthKey(timestamp: Date): string {
  const year = timestamp.getUTCFullYear()
  const month = (timestamp.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Generate a SHA-256 fingerprint for a monthly chunk.
 *
 * The fingerprint is based on:
 * - Month start date (ISO string)
 * - Message count (for detecting partial exports)
 * - First N messages (sender + content, with rounded timestamps)
 *
 * @param monthMessages - All messages in this month
 * @param monthStart - First day of the month (UTC)
 * @param config - Optional configuration
 * @returns SHA-256 hex string
 */
export function generateChunkFingerprint(
  monthMessages: readonly ParsedMessage[],
  monthStart: Date,
  config: FingerprintConfig = {}
): string {
  const { sampleSize = DEFAULT_SAMPLE_SIZE, includeCount = true } = config

  // Take first N messages (or all if fewer than N)
  const samplesToTake = Math.min(sampleSize, monthMessages.length)
  const sample = monthMessages.slice(0, samplesToTake)

  // Build fingerprint input from sample messages
  const messageLines = sample.map((m) => {
    const roundedTs = roundToMinute(m.timestamp)
    // Include: rounded timestamp | sender | content
    return `${roundedTs}|${m.sender}|${m.content}`
  })

  // Combine: month_start | message_count (optional) | message lines
  const parts: string[] = [monthStart.toISOString()]

  if (includeCount) {
    parts.push(String(monthMessages.length))
  }

  parts.push(...messageLines)

  const fingerprintInput = parts.join('\n')

  // Generate SHA-256 hash
  return createHash('sha256').update(fingerprintInput, 'utf8').digest('hex')
}

/**
 * Group messages by calendar month.
 * Returns a map of month key to messages in that month.
 */
export function groupMessagesByMonth(
  messages: readonly ParsedMessage[]
): Map<string, ParsedMessage[]> {
  const monthMap = new Map<string, ParsedMessage[]>()

  for (const message of messages) {
    const monthKey = getMonthKey(message.timestamp)

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, [])
    }

    monthMap.get(monthKey)?.push(message)
  }

  return monthMap
}

/**
 * Generate monthly chunks with fingerprints for a set of messages.
 *
 * @param messages - All messages to chunk
 * @param config - Optional configuration
 * @returns Array of monthly chunks, sorted by month (oldest first)
 */
export function generateMonthlyChunks(
  messages: readonly ParsedMessage[],
  config: FingerprintConfig = {}
): MonthlyChunk[] {
  if (messages.length === 0) {
    return []
  }

  const monthMap = groupMessagesByMonth(messages)
  const chunks: MonthlyChunk[] = []

  // Sort month keys chronologically
  const sortedMonthKeys = [...monthMap.keys()].sort()

  for (const monthKey of sortedMonthKeys) {
    const monthMessages = monthMap.get(monthKey)

    // Skip empty months (shouldn't happen, but be safe)
    if (!monthMessages || monthMessages.length === 0) {
      continue
    }

    // Sort messages by timestamp within month
    monthMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    const firstMessage = monthMessages[0]
    const lastMessage = monthMessages[monthMessages.length - 1]

    // These are guaranteed to exist since we checked length > 0
    if (!firstMessage || !lastMessage) {
      continue
    }
    const monthStart = getMonthStart(firstMessage.timestamp)

    const fingerprint = generateChunkFingerprint(monthMessages, monthStart, config)

    chunks.push({
      monthStart,
      monthKey,
      messageCount: monthMessages.length,
      fingerprint,
      firstMessageAt: firstMessage.timestamp,
      lastMessageAt: lastMessage.timestamp,
      messages: monthMessages
    })
  }

  return chunks
}

/**
 * Create a deduplication plan by comparing chunks against known fingerprints.
 *
 * @param chunks - Monthly chunks from the current upload
 * @param knownFingerprints - Set of fingerprints already processed
 * @returns Plan showing what to process and what to skip
 */
export function createDeduplicationPlan(
  chunks: readonly MonthlyChunk[],
  knownFingerprints: ReadonlySet<string>
): {
  chunksToProcess: MonthlyChunk[]
  duplicateChunks: MonthlyChunk[]
  messagesToProcess: number
  messagesSkipped: number
} {
  const chunksToProcess: MonthlyChunk[] = []
  const duplicateChunks: MonthlyChunk[] = []

  for (const chunk of chunks) {
    if (knownFingerprints.has(chunk.fingerprint)) {
      duplicateChunks.push(chunk)
    } else {
      chunksToProcess.push(chunk)
    }
  }

  return {
    chunksToProcess,
    duplicateChunks,
    messagesToProcess: chunksToProcess.reduce((sum, c) => sum + c.messageCount, 0),
    messagesSkipped: duplicateChunks.reduce((sum, c) => sum + c.messageCount, 0)
  }
}
