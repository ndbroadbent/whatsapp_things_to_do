/**
 * Classifier Module
 *
 * Use AI to determine if candidates are actual "things to do".
 */

import type { CandidateMessage, ClassifiedSuggestion, ClassifierConfig } from '../types.js'

/**
 * Classify candidate messages using AI.
 * Batches candidates for cost efficiency.
 */
export async function classifyMessages(
  candidates: CandidateMessage[],
  _config: ClassifierConfig
): Promise<ClassifiedSuggestion[]> {
  // TODO: Implement classifier
  // See src/classifier.py in Python prototype for reference
  throw new Error(`Not implemented. Candidate count: ${candidates.length}`)
}
