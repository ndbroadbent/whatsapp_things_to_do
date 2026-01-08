/**
 * Parser Module
 *
 * Parse WhatsApp and iMessage exports into structured messages.
 */

import type { ChatSource, MediaType, ParsedMessage, ParseResult, ParserOptions } from '../types'
import { parseIMessageChat, parseIMessageChatStream } from './imessage'
import { parseWhatsAppChat, parseWhatsAppChatStream } from './whatsapp'

export { parseIMessageChat, parseIMessageChatStream } from './imessage'
export {
  detectFormat,
  parseWhatsAppChat,
  parseWhatsAppChatStream
} from './whatsapp'

/** Maximum characters per message chunk */
export const MAX_CHUNK_LENGTH = 280

/** Minimum characters for a chunk to be worth splitting */
export const MIN_CHUNK_LENGTH = 32

/** Common fields for creating chunked messages */
interface ChunkableMessageData {
  readonly startId: number
  readonly timestamp: Date
  readonly sender: string
  readonly rawLine: string
  readonly source: ChatSource
  readonly urls: readonly string[]
  readonly hasMedia: boolean
  readonly mediaType?: MediaType | undefined
}

/**
 * Create ParsedMessage array from chunked content.
 * Shared logic used by both WhatsApp and iMessage parsers.
 */
export function createChunkedMessages(
  chunks: readonly string[],
  data: ChunkableMessageData
): ParsedMessage[] {
  return chunks.map((chunk, index) => ({
    id: data.startId + index,
    timestamp: data.timestamp,
    sender: data.sender,
    content: chunk,
    rawLine: index === 0 ? data.rawLine : '',
    hasMedia: data.hasMedia,
    mediaType: data.mediaType,
    urls: index === 0 && data.urls.length > 0 ? data.urls : undefined,
    source: data.source,
    chunkIndex: chunks.length > 1 ? index : undefined
  }))
}

/**
 * Split a long message into chunks of ≤280 characters.
 *
 * Chunk format:
 * - Single chunk (≤280 chars): returns content as-is
 * - First chunk: "message start…"
 * - Middle chunks: "…middle content…"
 * - Last chunk: "…message end"
 *
 * Splits at word boundaries when possible to avoid cutting words mid-stream.
 * Won't split if the result would create a chunk smaller than MIN_CHUNK_LENGTH.
 */
export function chunkMessage(
  content: string,
  maxLen: number = MAX_CHUNK_LENGTH,
  minLen: number = MIN_CHUNK_LENGTH
): string[] {
  if (content.length <= maxLen) {
    return [content]
  }

  const ellipsis = '…'
  const chunks: string[] = []

  // Account for ellipsis in chunk sizes
  // First chunk: content + ellipsis (1 char)
  // Middle chunks: ellipsis + content + ellipsis (2 chars)
  // Last chunk: ellipsis + content (1 char)
  const firstMaxLen = maxLen - 1
  const middleMaxLen = maxLen - 2
  const lastMaxLen = maxLen - 1

  let remaining = content
  let isFirst = true

  while (remaining.length > 0) {
    const effectiveMaxLen = isFirst ? firstMaxLen : middleMaxLen

    // Check if remaining content would create a too-small final chunk
    // If so, don't split - just include it in the current chunk (may exceed maxLen slightly)
    if (remaining.length <= lastMaxLen) {
      // Last chunk: add leading ellipsis (unless it's also the first)
      if (isFirst) {
        chunks.push(remaining)
      } else {
        chunks.push(`${ellipsis}${remaining}`)
      }
      break
    }

    // Check if splitting would leave a too-small remainder
    // Find a good break point (prefer word boundary)
    let breakPoint = effectiveMaxLen
    const spaceIndex = remaining.lastIndexOf(' ', effectiveMaxLen)
    if (spaceIndex > effectiveMaxLen * 0.5) {
      // Use word boundary if it's not too far back
      breakPoint = spaceIndex
    }

    const remainderAfterSplit = remaining.slice(breakPoint).trimStart()
    // If remainder would be too small, don't split - return what we have plus remainder
    if (remainderAfterSplit.length < minLen) {
      if (isFirst) {
        chunks.push(content) // Just return original, don't split
      } else {
        // Include remainder in current chunk even if it exceeds maxLen
        chunks.push(`${ellipsis}${remaining}`)
      }
      break
    }

    const chunk = remaining.slice(0, breakPoint).trimEnd()
    remaining = remainderAfterSplit

    if (isFirst) {
      chunks.push(`${chunk}${ellipsis}`)
      isFirst = false
    } else {
      chunks.push(`${ellipsis}${chunk}${ellipsis}`)
    }
  }

  return chunks
}

/**
 * Normalize apostrophe variants to straight apostrophe (U+0027).
 *
 * WhatsApp and iMessage exports often use curly apostrophes which don't match
 * regex patterns that use straight apostrophes (e.g., "Let's" vs "Let's").
 *
 * Handles:
 * - ' (U+2019) Right Single Quotation Mark (most common in iOS)
 * - ' (U+2018) Left Single Quotation Mark
 * - ʼ (U+02BC) Modifier Letter Apostrophe
 * - ` (U+0060) Grave Accent (backtick, sometimes used as apostrophe)
 */
export function normalizeApostrophes(text: string): string {
  return text.replace(/[\u2019\u2018\u02BC`]/g, "'")
}

/**
 * Detect the chat source from content.
 */
export function detectChatSource(content: string): ChatSource {
  // Check for WhatsApp patterns (timestamp in brackets)
  if (/^\[\d{1,2}\/\d{1,2}\/\d{2,4},/.test(content)) {
    return 'whatsapp'
  }

  // Check for Android WhatsApp pattern
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*-/.test(content)) {
    return 'whatsapp'
  }

  // Check for iMessage pattern (month name at start)
  if (/^[A-Z][a-z]{2} \d{1,2}, \d{4}\s+\d{1,2}:\d{2}:\d{2} [AP]M/.test(content)) {
    return 'imessage'
  }

  // Default to whatsapp
  return 'whatsapp'
}

/**
 * Parse a chat export (auto-detect format).
 */
export function parseChat(raw: string, options?: ParserOptions): ParsedMessage[] {
  const source = detectChatSource(raw)

  if (source === 'imessage') {
    return parseIMessageChat(raw)
  }

  return parseWhatsAppChat(raw, options)
}

/**
 * Parse a chat export and return detailed results.
 */
export function parseChatWithStats(raw: string, options?: ParserOptions): ParseResult {
  const messages = parseChat(raw, options)

  const senders = [...new Set(messages.map((m) => m.sender))]
  const timestamps = messages.map((m) => m.timestamp)
  const urlCount = messages.reduce((count, m) => count + (m.urls?.length ?? 0), 0)

  const sortedTimestamps = timestamps.sort((a, b) => a.getTime() - b.getTime())
  const start = sortedTimestamps[0] ?? new Date()
  const end = sortedTimestamps[sortedTimestamps.length - 1] ?? new Date()

  return {
    messages,
    senders,
    dateRange: { start, end },
    messageCount: messages.length,
    urlCount
  }
}

/**
 * Parse a chat export (streaming, auto-detect format).
 * Note: For streaming, caller must provide the source type since we can't peek ahead.
 */
export async function* parseChatStream(
  lines: AsyncIterable<string>,
  source: ChatSource,
  options?: ParserOptions
): AsyncIterable<ParsedMessage> {
  if (source === 'imessage') {
    yield* parseIMessageChatStream(lines)
  } else {
    yield* parseWhatsAppChatStream(lines, options)
  }
}
