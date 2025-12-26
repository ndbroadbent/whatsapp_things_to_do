/**
 * iMessage Chat Parser
 *
 * Parses iMessage export format from imessage-exporter tool.
 *
 * Format:
 * Apr 02, 2025  8:52:29 AM (Read by you after 39 minutes, 44 seconds)
 * Sender Name
 * Message content
 * (can be multi-line)
 *
 * OR:
 * Apr 02, 2025  9:32:50 AM
 * Me
 * Message content
 */

import type { ParsedMessage } from '../types'
import { chunkMessage, createChunkedMessages, normalizeApostrophes } from './index'

// Timestamp line pattern: Apr 02, 2025  8:52:29 AM (optional read receipt)
const TIMESTAMP_PATTERN =
  /^([A-Z][a-z]{2} \d{1,2}, \d{4})\s+(\d{1,2}:\d{2}:\d{2} [AP]M)(?:\s*\(.*\))?$/

// URL extraction pattern
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi

// Month name to number mapping
const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11
}

/**
 * Parse iMessage timestamp: Apr 02, 2025  8:52:29 AM
 */
function parseTimestamp(dateStr: string, timeStr: string): Date {
  // Parse date: "Apr 02, 2025"
  const dateMatch = dateStr.match(/([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/)
  if (!dateMatch) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }

  const [, monthName, day, year] = dateMatch
  const month = MONTHS[monthName ?? 'Jan'] ?? 0

  // Parse time: "8:52:29 AM"
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2}) ([AP]M)/)
  if (!timeMatch) {
    throw new Error(`Invalid time format: ${timeStr}`)
  }

  const [, hourStr, minute, second, ampm] = timeMatch
  let hour = Number.parseInt(hourStr ?? '0', 10)
  if (ampm === 'PM' && hour !== 12) {
    hour += 12
  } else if (ampm === 'AM' && hour === 12) {
    hour = 0
  }

  return new Date(
    Number.parseInt(year ?? '2025', 10),
    month,
    Number.parseInt(day ?? '1', 10),
    hour,
    Number.parseInt(minute ?? '0', 10),
    Number.parseInt(second ?? '0', 10)
  )
}

/**
 * Extract all URLs from message content.
 */
function extractUrls(content: string): string[] {
  const matches = content.match(URL_PATTERN)
  if (!matches) {
    return []
  }

  return matches.map((url) => url.replace(/[.,;:!?]+$/, '')).filter((url) => url.length > 0)
}

interface MessageBuilder {
  timestamp: Date
  sender: string
  contentLines: string[]
  rawLines: string[]
}

type ParserState = 'timestamp' | 'sender' | 'content'

/**
 * Finalize a message builder into ParsedMessage(s), chunking long content.
 * Returns an array of messages (multiple if content was chunked).
 */
function finalizeBuilder(builder: MessageBuilder, startId: number): ParsedMessage[] {
  const content = builder.contentLines.join('\n').trim()
  if (content.length === 0) return []

  const urls = extractUrls(content)
  const rawLine = builder.rawLines.join('\n')
  const chunks = chunkMessage(content)

  return createChunkedMessages(chunks, {
    startId,
    timestamp: builder.timestamp,
    sender: builder.sender,
    rawLine,
    source: 'imessage',
    urls,
    hasMedia: false
  })
}

interface IMessageParserState {
  currentBuilder: MessageBuilder | null
  messageId: number
  state: ParserState
  pendingTimestamp: Date | null
}

function createInitialState(): IMessageParserState {
  return {
    currentBuilder: null,
    messageId: 0,
    state: 'timestamp',
    pendingTimestamp: null
  }
}

function handleTimestampLine(
  timestampMatch: RegExpExecArray,
  parserState: IMessageParserState
): ParsedMessage[] {
  let messages: ParsedMessage[] = []

  if (parserState.currentBuilder && parserState.currentBuilder.contentLines.length > 0) {
    messages = finalizeBuilder(parserState.currentBuilder, parserState.messageId)
    parserState.messageId += messages.length
  }

  const [, dateStr, timeStr] = timestampMatch
  if (dateStr && timeStr) {
    parserState.pendingTimestamp = parseTimestamp(dateStr, timeStr)
  }
  parserState.state = 'sender'
  parserState.currentBuilder = null

  return messages
}

function handleSenderLine(
  line: string,
  trimmedLine: string,
  parserState: IMessageParserState
): void {
  if (trimmedLine && parserState.pendingTimestamp) {
    parserState.currentBuilder = {
      timestamp: parserState.pendingTimestamp,
      sender: trimmedLine,
      contentLines: [],
      rawLines: [line]
    }
    parserState.state = 'content'
    parserState.pendingTimestamp = null
  }
}

function handleContentLine(
  line: string,
  trimmedLine: string,
  parserState: IMessageParserState
): void {
  if (parserState.currentBuilder) {
    parserState.currentBuilder.contentLines.push(trimmedLine)
    parserState.currentBuilder.rawLines.push(line)
  }
}

/**
 * Process a single line and return messages if a complete one was found.
 */
function processLine(line: string, parserState: IMessageParserState): ParsedMessage[] {
  const trimmedLine = line.trim()
  const timestampMatch = TIMESTAMP_PATTERN.exec(trimmedLine)

  if (timestampMatch) {
    return handleTimestampLine(timestampMatch, parserState)
  }

  if (parserState.state === 'sender') {
    handleSenderLine(line, trimmedLine, parserState)
  } else if (parserState.state === 'content') {
    handleContentLine(line, trimmedLine, parserState)
  }

  return []
}

/**
 * Finalize the parser state and return any remaining messages.
 */
function finalizeParserState(parserState: IMessageParserState): ParsedMessage[] {
  if (parserState.currentBuilder && parserState.currentBuilder.contentLines.length > 0) {
    return finalizeBuilder(parserState.currentBuilder, parserState.messageId)
  }
  return []
}

/**
 * Parse an iMessage chat export (synchronous, for small files).
 */
export function parseIMessageChat(raw: string): ParsedMessage[] {
  // Normalize apostrophe variants (curly → straight) for regex matching
  const normalized = normalizeApostrophes(raw)
  const lines = normalized.split('\n')
  const messages: ParsedMessage[] = []
  const parserState = createInitialState()

  for (const line of lines) {
    const parsed = processLine(line, parserState)
    messages.push(...parsed)
  }

  const finalized = finalizeParserState(parserState)
  messages.push(...finalized)

  return messages
}

/**
 * Parse an iMessage chat export (streaming, for large files).
 */
export async function* parseIMessageChatStream(
  lines: AsyncIterable<string>
): AsyncIterable<ParsedMessage> {
  const parserState = createInitialState()

  for await (const rawLine of lines) {
    // Normalize apostrophe variants (curly → straight) for regex matching
    const line = normalizeApostrophes(rawLine)
    const parsed = processLine(line, parserState)
    for (const msg of parsed) {
      yield msg
    }
  }

  const finalized = finalizeParserState(parserState)
  for (const msg of finalized) {
    yield msg
  }
}
