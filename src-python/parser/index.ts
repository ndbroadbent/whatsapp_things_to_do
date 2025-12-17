/**
 * Parser Module
 *
 * Parse WhatsApp (and future: iMessage) exports into structured messages.
 */

import type { ParsedMessage, ParserOptions } from '../types.js'

/**
 * Parse a WhatsApp chat export file (synchronous).
 * For small files (< 10MB).
 */
export function parseWhatsAppChat(raw: string, _options?: ParserOptions): ParsedMessage[] {
  // TODO: Implement parser
  // See src/parser.py in Python prototype for reference
  throw new Error(`Not implemented. Input length: ${raw.length}`)
}

/**
 * Parse a WhatsApp chat export file (streaming).
 * For large files.
 */
export async function* parseWhatsAppChatStream(
  _lines: AsyncIterable<string>,
  _options?: ParserOptions
): AsyncIterable<ParsedMessage> {
  // TODO: Implement streaming parser
  // See src/parser.py in Python prototype for reference
  yield {
    id: -1,
    timestamp: new Date(),
    sender: '',
    content: 'NOT_IMPLEMENTED',
    rawLine: '',
    hasMedia: false
  }
  throw new Error('parseWhatsAppChatStream not implemented')
}
