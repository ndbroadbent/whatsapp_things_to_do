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
 * - Messages are already chunked at parse time (≤280 chars each), no truncation needed
 * - Snaps to message boundaries
 * - Messages include timestamps in WhatsApp format so AI understands time gaps
 */

import type { CandidateMessage, ContextMessage, ParsedMessage } from '../types'

const MIN_CONTEXT_CHARS = 280
export const MIN_CONTEXT_MESSAGES = 2

export interface MessageContext {
  /** Context messages before target */
  readonly before: readonly ContextMessage[]
  /** Context messages after target */
  readonly after: readonly ContextMessage[]
  /** First message ID in context window (before target) */
  readonly firstMessageId: number
  /** Last message ID in context window (after target) */
  readonly lastMessageId: number
  /** The target message ID */
  readonly targetMessageId: number
}

/**
 * Convert a ParsedMessage to a ContextMessage.
 * No truncation needed - messages are already chunked at parse time.
 */
function toContextMessage(msg: ParsedMessage): ContextMessage {
  return {
    id: msg.id,
    sender: msg.sender,
    content: msg.content,
    timestamp: msg.timestamp
  }
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
    throw new Error(
      `Cannot get context: message at index ${index} not found (messages.length=${messages.length})`
    )
  }

  const beforeMessages: ContextMessage[] = []
  const afterMessages: ContextMessage[] = []
  let beforeChars = 0
  let afterChars = 0
  let firstMessageId = targetMsg.id
  let lastMessageId = targetMsg.id

  // Get messages before: minimum 2 messages OR 280 chars (whichever comes later)
  for (let i = index - 1; i >= 0; i--) {
    const msg = messages[i]
    if (!msg) continue
    const contextMsg = toContextMessage(msg)

    beforeMessages.unshift(contextMsg)
    beforeChars += contextMsg.content.length
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
    const contextMsg = toContextMessage(msg)

    afterMessages.push(contextMsg)
    afterChars += contextMsg.content.length
    lastMessageId = msg.id

    // Stop when we have both minimums met
    if (afterMessages.length >= MIN_CONTEXT_MESSAGES && afterChars >= MIN_CONTEXT_CHARS) {
      break
    }
  }

  return {
    before: beforeMessages,
    after: afterMessages,
    firstMessageId,
    lastMessageId,
    targetMessageId: targetMsg.id
  }
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
