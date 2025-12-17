/**
 * WhatsApp Chat Parser
 *
 * Parses WhatsApp iOS and Android export formats into structured messages.
 *
 * iOS format: [MM/DD/YY, H:MM:SS AM/PM] Sender: Message
 * Android format: MM/DD/YY, H:MM - Sender: Message
 */

import type { MediaType, ParsedMessage, ParserOptions, WhatsAppFormat } from '../types.js'

// WhatsApp iOS format: [MM/DD/YY, H:MM:SS AM/PM] Sender: Message
const IOS_MESSAGE_PATTERN =
  /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}:\d{2}\s*[AP]M)\]\s*([^:]+):\s*(.*)$/

// WhatsApp Android format: MM/DD/YY, H:MM - Sender: Message
const ANDROID_MESSAGE_PATTERN =
  /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2})\s*-\s*([^:]+):\s*(.*)$/

// Media placeholders in WhatsApp exports (with optional left-to-right mark)
const MEDIA_PATTERNS: Record<MediaType, RegExp> = {
  image: /^[\u200E]?image omitted$/i,
  video: /^[\u200E]?video omitted$/i,
  audio: /^[\u200E]?audio omitted$/i,
  gif: /^[\u200E]?GIF omitted$/i,
  sticker: /^[\u200E]?sticker omitted$/i,
  document: /^[\u200E]?document omitted$/i,
  contact: /^[\u200E]?Contact card omitted$/i
}

// System messages to skip
const SYSTEM_PATTERNS: readonly RegExp[] = [
  /^[\u200E]?This message was deleted\.?$/i,
  /^[\u200E]?You deleted this message\.?$/i,
  /^[\u200E]?Messages and calls are end-to-end encrypted/i,
  /^[\u200E]?Missed (voice|video) call$/i,
  /^[\u200E]?.*changed the subject from/i,
  /^[\u200E]?.*changed this group's icon$/i,
  /^[\u200E]?.*added you$/i,
  /^[\u200E]?.*left$/i,
  /^[\u200E]?.*removed/i,
  /^[\u200E]?.*created group/i,
  /^[\u200E]?.*changed the group description/i,
  /^[\u200E]?Waiting for this message/i,
  /^[\u200E]?You're now an admin$/i,
  /^[\u200E]?.*'s security code changed/i
]

// URL extraction pattern
const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi

/**
 * Parse a WhatsApp timestamp (iOS format: MM/DD/YY H:MM:SS AM/PM)
 */
function parseIosTimestamp(dateStr: string, timeStr: string): Date {
  const dateParts = dateStr.split('/')
  if (dateParts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }

  const [month, day, year] = dateParts
  const fullYear = year?.length === 2 ? `20${year}` : year

  // Parse time with AM/PM
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)/i)
  if (!timeMatch) {
    throw new Error(`Invalid time format: ${timeStr}`)
  }

  const [, hourStr, minute, second, ampm] = timeMatch
  let hour = Number.parseInt(hourStr ?? '0', 10)
  if (ampm?.toUpperCase() === 'PM' && hour !== 12) {
    hour += 12
  } else if (ampm?.toUpperCase() === 'AM' && hour === 12) {
    hour = 0
  }

  return new Date(
    Number.parseInt(fullYear ?? '2025', 10),
    Number.parseInt(month ?? '1', 10) - 1,
    Number.parseInt(day ?? '1', 10),
    hour,
    Number.parseInt(minute ?? '0', 10),
    Number.parseInt(second ?? '0', 10)
  )
}

/**
 * Parse a WhatsApp timestamp (Android format: MM/DD/YY H:MM)
 */
function parseAndroidTimestamp(dateStr: string, timeStr: string): Date {
  const dateParts = dateStr.split('/')
  if (dateParts.length !== 3) {
    throw new Error(`Invalid date format: ${dateStr}`)
  }

  const [month, day, year] = dateParts
  const fullYear = year?.length === 2 ? `20${year}` : year

  const timeParts = timeStr.split(':')
  if (timeParts.length !== 2) {
    throw new Error(`Invalid time format: ${timeStr}`)
  }

  const [hour, minute] = timeParts

  return new Date(
    Number.parseInt(fullYear ?? '2025', 10),
    Number.parseInt(month ?? '1', 10) - 1,
    Number.parseInt(day ?? '1', 10),
    Number.parseInt(hour ?? '0', 10),
    Number.parseInt(minute ?? '0', 10)
  )
}

/**
 * Detect if message content is a media placeholder.
 */
function detectMediaType(content: string): MediaType | undefined {
  const trimmed = content.trim()
  for (const [type, pattern] of Object.entries(MEDIA_PATTERNS)) {
    if (pattern.test(trimmed)) {
      return type as MediaType
    }
  }
  return undefined
}

/**
 * Check if message content is a system message that should be skipped.
 */
function isSystemMessage(content: string): boolean {
  const trimmed = content.trim()
  return SYSTEM_PATTERNS.some((pattern) => pattern.test(trimmed))
}

/**
 * Extract all URLs from message content.
 */
function extractUrls(content: string): string[] {
  const matches = content.match(URL_PATTERN)
  if (!matches) {
    return []
  }

  // Clean trailing punctuation
  return matches.map((url) => url.replace(/[.,;:!?]+$/, '')).filter((url) => url.length > 0)
}

/**
 * Detect the format of a WhatsApp export (iOS or Android).
 */
export function detectFormat(content: string): WhatsAppFormat {
  const lines = content.split('\n').slice(0, 20)

  let iosMatches = 0
  let androidMatches = 0

  for (const line of lines) {
    if (IOS_MESSAGE_PATTERN.test(line)) {
      iosMatches++
    }
    if (ANDROID_MESSAGE_PATTERN.test(line)) {
      androidMatches++
    }
  }

  if (iosMatches > androidMatches) {
    return 'ios'
  }
  if (androidMatches > iosMatches) {
    return 'android'
  }

  // Default to iOS if unclear
  return 'ios'
}

interface MessageBuilder {
  timestamp: Date
  sender: string
  content: string
  rawLine: string
}

/**
 * Finalize a message by detecting media type and extracting URLs.
 */
function finalizeMessage(builder: MessageBuilder, id: number): ParsedMessage | null {
  const content = builder.content.trim()

  // Skip system messages
  if (isSystemMessage(content)) {
    return null
  }

  const mediaType = detectMediaType(content)
  const hasMedia = mediaType !== undefined
  const urls = extractUrls(content)

  return {
    id,
    timestamp: builder.timestamp,
    sender: builder.sender,
    content,
    rawLine: builder.rawLine,
    hasMedia,
    mediaType,
    urls: urls.length > 0 ? urls : undefined,
    source: 'whatsapp'
  }
}

interface FormatConfig {
  pattern: RegExp
  parseTimestamp: (dateStr: string, timeStr: string) => Date
}

function getFormatConfig(format: WhatsAppFormat): FormatConfig {
  return {
    pattern: format === 'ios' ? IOS_MESSAGE_PATTERN : ANDROID_MESSAGE_PATTERN,
    parseTimestamp: format === 'ios' ? parseIosTimestamp : parseAndroidTimestamp
  }
}

function resolveFormat(content: string, options?: ParserOptions): WhatsAppFormat {
  if (options?.format && options.format !== 'auto') {
    return options.format
  }
  return detectFormat(content)
}

function createBuilderFromMatch(
  match: RegExpExecArray,
  line: string,
  parseTimestamp: (d: string, t: string) => Date
): MessageBuilder | null {
  const [, dateStr, timeStr, sender, content] = match

  if (!dateStr || !timeStr || !sender) return null

  return {
    timestamp: parseTimestamp(dateStr, timeStr),
    sender: sender.trim(),
    content: content ?? '',
    rawLine: line
  }
}

function appendToBuilder(builder: MessageBuilder, line: string): void {
  builder.content += `\n${line}`
  builder.rawLine += `\n${line}`
}

/**
 * Parse a WhatsApp chat export (synchronous, for small files).
 */
export function parseWhatsAppChat(raw: string, options?: ParserOptions): ParsedMessage[] {
  const format = resolveFormat(raw, options)
  const { pattern, parseTimestamp } = getFormatConfig(format)
  const lines = raw.split('\n')
  const messages: ParsedMessage[] = []

  let currentBuilder: MessageBuilder | null = null
  let messageId = 0

  for (const line of lines) {
    const match = pattern.exec(line)

    if (match) {
      if (currentBuilder) {
        const msg = finalizeMessage(currentBuilder, messageId)
        if (msg) {
          messages.push(msg)
          messageId++
        }
      }
      currentBuilder = createBuilderFromMatch(match, line, parseTimestamp)
    } else if (currentBuilder) {
      appendToBuilder(currentBuilder, line)
    }
  }

  if (currentBuilder) {
    const msg = finalizeMessage(currentBuilder, messageId)
    if (msg) messages.push(msg)
  }

  return messages
}

interface ProcessLineResult {
  message: ParsedMessage | null
  builder: MessageBuilder | null
}

function processLine(
  line: string,
  config: FormatConfig,
  currentBuilder: MessageBuilder | null,
  messageId: number
): ProcessLineResult {
  const match = config.pattern.exec(line)

  if (match) {
    const message = currentBuilder ? finalizeMessage(currentBuilder, messageId) : null
    const builder = createBuilderFromMatch(match, line, config.parseTimestamp)
    return { message, builder }
  }

  if (currentBuilder) {
    appendToBuilder(currentBuilder, line)
  }

  return { message: null, builder: currentBuilder }
}

interface StreamState {
  lineBuffer: string[]
  config: FormatConfig | null
  currentBuilder: MessageBuilder | null
  messageId: number
}

function* processBufferedLines(state: StreamState): Generator<ParsedMessage, void, undefined> {
  if (!state.config) return

  for (const line of state.lineBuffer) {
    const result = processLine(line, state.config, state.currentBuilder, state.messageId)
    if (result.message) {
      yield result.message
      state.messageId++
    }
    state.currentBuilder = result.builder
  }
  state.lineBuffer.length = 0
}

/**
 * Parse a WhatsApp chat export (streaming, for large files).
 */
export async function* parseWhatsAppChatStream(
  lines: AsyncIterable<string>,
  options?: ParserOptions
): AsyncIterable<ParsedMessage> {
  const state: StreamState = {
    lineBuffer: [],
    config: null,
    currentBuilder: null,
    messageId: 0
  }

  for await (const line of lines) {
    if (state.config === null) {
      state.lineBuffer.push(line)
      if (state.lineBuffer.length >= 20) {
        const format = resolveFormat(state.lineBuffer.join('\n'), options)
        state.config = getFormatConfig(format)
        yield* processBufferedLines(state)
      }
      continue
    }

    const result = processLine(line, state.config, state.currentBuilder, state.messageId)
    if (result.message) {
      yield result.message
      state.messageId++
    }
    state.currentBuilder = result.builder
  }

  // Process remaining buffered lines (if file had < 20 lines)
  if (state.config === null && state.lineBuffer.length > 0) {
    const format = resolveFormat(state.lineBuffer.join('\n'), options)
    state.config = getFormatConfig(format)
    yield* processBufferedLines(state)
  }

  // Finalize last message
  if (state.currentBuilder) {
    const msg = finalizeMessage(state.currentBuilder, state.messageId)
    if (msg) yield msg
  }
}
