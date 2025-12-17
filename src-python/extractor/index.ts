/**
 * Extractor Module
 *
 * Find messages likely to contain "things to do" suggestions using cheap heuristics.
 */

import type { CandidateMessage, ExtractorOptions, ParsedMessage } from '../types.js'

/**
 * Extract candidate messages using regex patterns and URL detection.
 * No AI cost - pure heuristics.
 */
export function extractCandidates(
  messages: ParsedMessage[],
  _options?: ExtractorOptions
): CandidateMessage[] {
  // TODO: Implement extractor
  // See src/suggestion_extractor.py in Python prototype for reference
  throw new Error(`Not implemented. Message count: ${messages.length}`)
}
