/**
 * Quick Scanner Module
 *
 * Parse chat content and extract candidates using heuristics only.
 * Zero API cost - no AI calls, no API keys required.
 */

import { extractCandidates } from '../extractor/index.js'
import { parseChatWithStats } from '../parser/index.js'
import type { CandidateMessage, ChatSource, ExtractorOptions, ParserOptions } from '../types.js'

/**
 * Result of a quick scan operation.
 */
export interface QuickScanResult {
  /** Total number of messages parsed */
  readonly messageCount: number
  /** Date range of the chat */
  readonly dateRange: {
    readonly start: Date
    readonly end: Date
  }
  /** Number of unique senders in the chat */
  readonly senderCount: number
  /** Total URLs found in messages */
  readonly urlCount: number
  /** Candidate messages found by heuristics, sorted by confidence descending */
  readonly candidates: readonly CandidateMessage[]
  /** Statistics about how candidates were found */
  readonly stats: {
    readonly regexMatches: number
    readonly urlMatches: number
    readonly totalUnique: number
  }
  /** Detected chat source (whatsapp or imessage) */
  readonly source: ChatSource
}

/**
 * Options for quick scan.
 */
export interface QuickScanOptions {
  /** Parser options (format, timezone) */
  readonly parser?: ParserOptions | undefined
  /** Extractor options (min confidence, patterns) */
  readonly extractor?: ExtractorOptions | undefined
  /** Maximum candidates to return (default: all) */
  readonly maxCandidates?: number | undefined
  /** Maximum messages to process (for testing) */
  readonly maxMessages?: number | undefined
}

/**
 * Quick scan a chat export to find candidate activities using heuristics only.
 *
 * This function requires NO API keys and makes NO API calls.
 * It uses regex patterns and URL detection to find likely "things to do" activities.
 *
 * @param content Raw chat content (WhatsApp or iMessage export text)
 * @param options Scan options
 * @returns Quick scan result with candidates and stats
 *
 * @example
 * ```typescript
 * // Scan a WhatsApp export
 * const result = quickScan(chatText)
 * console.log(`Found ${result.candidates.length} potential activities`)
 *
 * // Scan with options
 * const result = quickScan(chatText, {
 *   extractor: { minConfidence: 0.6 },
 *   maxCandidates: 50
 * })
 * ```
 */
export function quickScan(content: string, options?: QuickScanOptions): QuickScanResult {
  // Parse the chat
  const parseResult = parseChatWithStats(content, options?.parser)

  // Limit messages if maxMessages is set
  let messages = parseResult.messages
  if (options?.maxMessages !== undefined && messages.length > options.maxMessages) {
    messages = messages.slice(0, options.maxMessages)
  }

  // Extract candidates using heuristics
  const extractResult = extractCandidates(messages, options?.extractor)

  // Limit candidates if requested
  let candidates = extractResult.candidates
  if (options?.maxCandidates !== undefined && candidates.length > options.maxCandidates) {
    candidates = candidates.slice(0, options.maxCandidates)
  }

  // Detect source from first message
  const source = parseResult.messages[0]?.source ?? 'whatsapp'

  return {
    messageCount: parseResult.messageCount,
    dateRange: parseResult.dateRange,
    senderCount: parseResult.senders.length,
    urlCount: parseResult.urlCount,
    candidates,
    stats: {
      regexMatches: extractResult.regexMatches,
      urlMatches: extractResult.urlMatches,
      totalUnique: extractResult.totalUnique
    },
    source
  }
}

/**
 * Quick scan from parsed messages (when already parsed).
 *
 * Use this when you've already parsed the chat and just need to extract candidates.
 *
 * @param messages Already parsed messages
 * @param options Extractor options
 * @returns Candidates and extraction stats
 */
export function quickScanMessages(
  messages: Parameters<typeof extractCandidates>[0],
  options?: ExtractorOptions & { maxCandidates?: number }
): {
  candidates: readonly CandidateMessage[]
  stats: { regexMatches: number; urlMatches: number; totalUnique: number }
} {
  const extractResult = extractCandidates(messages, options)

  let candidates = extractResult.candidates
  if (options?.maxCandidates !== undefined && candidates.length > options.maxCandidates) {
    candidates = candidates.slice(0, options.maxCandidates)
  }

  return {
    candidates,
    stats: {
      regexMatches: extractResult.regexMatches,
      urlMatches: extractResult.urlMatches,
      totalUnique: extractResult.totalUnique
    }
  }
}
