/**
 * Message Offset Resolution
 *
 * Handles resolving message content when the AI specifies an offset
 * from the candidate message (e.g., for [AGREE] candidates pointing
 * to earlier messages, or clarifications in later messages).
 */

import type { CandidateMessage, ContextMessage } from '../types'

/**
 * Resolve the actual message info using offset.
 * When off=0, use the candidate directly.
 * When off=-1, use contextBefore[last] (immediately before candidate).
 * When off=+1, use contextAfter[0] (immediately after candidate).
 *
 * Throws an error if the offset is invalid (points outside context bounds).
 */
export function resolveMessageWithOffset(
  candidate: CandidateMessage,
  offset: number
): ContextMessage {
  if (offset === 0) {
    return {
      id: candidate.messageId,
      sender: candidate.sender,
      content: candidate.content,
      timestamp: candidate.timestamp
    }
  }

  // Negative offset = look in contextBefore
  // off=-1 means last element of contextBefore (immediately before candidate)
  // off=-2 means second-to-last element, etc.
  if (offset < 0) {
    const contextIndex = candidate.contextBefore.length + offset
    const contextMsg = candidate.contextBefore[contextIndex]
    if (contextMsg) {
      return contextMsg
    }
    throw new Error(
      `Invalid offset ${offset} for msg=${candidate.messageId}: contextBefore has ${candidate.contextBefore.length} messages`
    )
  }

  // Positive offset = look in contextAfter
  // off=+1 means first element of contextAfter (immediately after candidate)
  // off=+2 means second element, etc.
  const contextIndex = offset - 1
  const contextMsg = candidate.contextAfter[contextIndex]
  if (contextMsg) {
    return contextMsg
  }
  throw new Error(
    `Invalid offset ${offset} for msg=${candidate.messageId}: contextAfter has ${candidate.contextAfter.length} messages`
  )
}
