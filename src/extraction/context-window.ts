/**
 * Context Window Module
 *
 * Shared logic for building context windows around messages.
 * Used by both the classifier (for AI context) and deduplication
 * (to check if agreements fall within a suggestion's context).
 *
 * Rules:
 * - Minimum 280 chars before and 280 chars after
 * - Minimum 2 messages on each side
 * - Each message truncated to max 280 chars with "[truncated to 280 chars]" suffix
 * - Snaps to message boundaries
 * - Messages include timestamps in WhatsApp format so AI understands time gaps
 */

import type { CandidateMessage, ParsedMessage } from '../types'

/**
 * Format a message line with ISO timestamp.
 * Example: "[2024-10-11T13:34] John: Hello world"
 */
export function formatMessageLine(msg: ParsedMessage): string {
  const iso = msg.timestamp.toISOString().slice(0, 16) // "2024-10-11T13:34"
  return `[${iso}] ${msg.sender}: ${msg.content}`
}

export const MIN_CONTEXT_CHARS = 280
export const MIN_CONTEXT_MESSAGES = 2
export const MAX_MESSAGE_CHARS = 280
export const TRUNCATION_MARKER = ' [truncated to 280 chars]'

export interface MessageContext {
  /** Formatted context string before target */
  readonly before: string
  /** Formatted context string after target */
  readonly after: string
  /** Number of messages included before target (2-20+) */
  readonly beforeMessageCount: number
  /** Number of messages included after target (2-20+) */
  readonly afterMessageCount: number
  /** First message ID in context window (before target) */
  readonly firstMessageId: number
  /** Last message ID in context window (after target) */
  readonly lastMessageId: number
  /** The target message ID */
  readonly targetMessageId: number
}

/**
 * Truncate a message line to max chars with marker.
 */
export function truncateMessage(line: string): string {
  if (line.length <= MAX_MESSAGE_CHARS) return line
  return line.slice(0, MAX_MESSAGE_CHARS) + TRUNCATION_MARKER
}

/**
 * Get context around a message.
 *
 * Rules:
 * - Minimum 280 chars before and 280 chars after
 * - Minimum 2 messages on each side
 * - Each message truncated to max 280 chars with "[truncated to 280 chars]" suffix
 * - For prior context: snap to message boundaries, then truncate
 *
 * Returns both the formatted context strings AND the message counts/IDs
 * for use in deduplication.
 */
export function getMessageContext(
  messages: readonly ParsedMessage[],
  index: number
): MessageContext {
  const targetMsg = messages[index]
  if (!targetMsg) {
    return {
      before: '',
      after: '',
      beforeMessageCount: 0,
      afterMessageCount: 0,
      firstMessageId: -1,
      lastMessageId: -1,
      targetMessageId: -1
    }
  }

  const beforeMessages: string[] = []
  const afterMessages: string[] = []
  let beforeChars = 0
  let afterChars = 0
  let firstMessageId = targetMsg.id
  let lastMessageId = targetMsg.id

  // Get messages before: minimum 2 messages OR 280 chars (whichever comes later)
  for (let i = index - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) continue
    const rawLine = formatMessageLine(msg)
    const line = truncateMessage(rawLine)

    beforeMessages.unshift(line)
    beforeChars += line.length
    firstMessageId = msg.id

    // Stop when we have both minimums met
    if (beforeMessages.length >= MIN_CONTEXT_MESSAGES && beforeChars >= MIN_CONTEXT_CHARS) {
      break
    }
  }

  // Get messages after: minimum 2 messages OR 280 chars (whichever comes later)
  for (let i = index + 1; i < messages.length; i++) {
    const msg = messages[i]
    if (!msg) continue
    const rawLine = formatMessageLine(msg)
    const line = truncateMessage(rawLine)

    afterMessages.push(line)
    afterChars += line.length
    lastMessageId = msg.id

    // Stop when we have both minimums met
    if (afterMessages.length >= MIN_CONTEXT_MESSAGES && afterChars >= MIN_CONTEXT_CHARS) {
      break
    }
  }

  return {
    before: beforeMessages.join('\n'),
    after: afterMessages.join('\n'),
    beforeMessageCount: beforeMessages.length,
    afterMessageCount: afterMessages.length,
    firstMessageId,
    lastMessageId,
    targetMessageId: targetMsg.id
  }
}

/**
 * Build full context string: before + >>> target + after
 */
export function buildContextString(msg: ParsedMessage, ctx: MessageContext): string {
  const iso = msg.timestamp.toISOString().slice(0, 16)
  const parts: string[] = []
  if (ctx.before) parts.push(ctx.before)
  parts.push(`>>> [${iso}] ${msg.sender}: ${msg.content}`)
  if (ctx.after) parts.push(ctx.after)
  return parts.join('\n')
}

/**
 * Check if a message ID falls within a context window.
 */
export function isInContextWindow(messageId: number, ctx: MessageContext): boolean {
  // Don't match the target itself
  if (messageId === ctx.targetMessageId) return false
  return messageId >= ctx.firstMessageId && messageId <= ctx.lastMessageId
}

/**
 * Deduplicate agreement candidates that fall within a suggestion's context window.
 *
 * When an agreement (like "That looks amazing!") appears in the context window
 * of a suggestion (like "Let's do a whale safari!"), the agreement is redundant
 * because the classifier will see both in the same context. Keep only the suggestion.
 *
 * Uses the same context window logic as the classifier (280 chars / 2 messages minimum).
 */
export function deduplicateAgreements(
  candidates: readonly CandidateMessage[],
  messages: readonly ParsedMessage[]
): { candidates: CandidateMessage[]; removedCount: number } {
  // Build map from messageId to index for quick lookup
  const idToIndex = new Map<number, number>()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg) idToIndex.set(msg.id, i)
  }

  // Separate suggestions and agreements
  const suggestions = candidates.filter((c) => c.candidateType === 'suggestion')
  const agreements = candidates.filter((c) => c.candidateType === 'agreement')

  // Compute context windows for all suggestions
  const suggestionContexts: MessageContext[] = []
  for (const suggestion of suggestions) {
    const index = idToIndex.get(suggestion.messageId)
    if (index !== undefined) {
      suggestionContexts.push(getMessageContext(messages, index))
    }
  }

  // Filter agreements: keep only those NOT within any suggestion's context window
  const keptAgreements: CandidateMessage[] = []
  let removedCount = 0

  for (const agreement of agreements) {
    const isInAnySuggestionContext = suggestionContexts.some((ctx) =>
      isInContextWindow(agreement.messageId, ctx)
    )

    if (isInAnySuggestionContext) {
      removedCount++
    } else {
      keptAgreements.push(agreement)
    }
  }

  // Merge and sort by confidence
  const result = [...suggestions, ...keptAgreements].sort((a, b) => b.confidence - a.confidence)

  return { candidates: result, removedCount }
}
