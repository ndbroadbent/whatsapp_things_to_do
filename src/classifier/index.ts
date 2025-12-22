/**
 * Classifier Module
 *
 * Use AI to determine if candidates are actual "things to do"
 * and extract activity/location details.
 */

import type {
  ActivityCategory,
  CandidateMessage,
  ClassifiedActivity,
  ClassifierConfig,
  ResponseCache,
  Result
} from '../types'
import { DEFAULT_MODELS } from './models'
import {
  buildClassificationPrompt,
  type ParsedClassification,
  parseClassificationResponse
} from './prompt'
import { callProviderWithFallbacks } from './providers'
import { countTokens, MAX_BATCH_TOKENS } from './tokenizer'

export {
  createSmartBatches,
  createTokenAwareBatches,
  groupCandidatesByProximity
} from './batching'
export type { ResolvedModel } from './models'
export { getRequiredApiKeyEnvVar, getValidModelIds, resolveModel } from './models'
export {
  buildClassificationPrompt,
  type ClassificationContext,
  parseClassificationResponse
} from './prompt'

import { VALID_CATEGORIES } from './categories'

const DEFAULT_BATCH_SIZE = 10

/**
 * Validate and normalize a category string.
 */
function normalizeCategory(category: string): ActivityCategory {
  const lower = category.toLowerCase()
  if (VALID_CATEGORIES.includes(lower as ActivityCategory)) {
    return lower as ActivityCategory
  }
  return 'other'
}

/**
 * Convert a parsed classification to a classified activity.
 */
function toClassifiedActivity(
  response: ParsedClassification,
  candidate: CandidateMessage
): ClassifiedActivity {
  return {
    messageId: candidate.messageId,
    activity: response.title ?? candidate.content.slice(0, 100),
    funScore: response.fun,
    interestingScore: response.int,
    category: normalizeCategory(response.cat),
    confidence: response.conf,
    originalMessage: candidate.content,
    sender: candidate.sender,
    timestamp: candidate.timestamp,
    isGeneric: response.gen,
    isCompound: response.com,
    action: response.act,
    actionOriginal: response.act_orig,
    object: response.obj,
    objectOriginal: response.obj_orig,
    venue: response.venue,
    city: response.city,
    region: response.region,
    country: response.country
  }
}

/**
 * Classify a batch of candidates.
 * Caching is handled by the provider layer (callProviderWithFallbacks).
 */
async function classifyBatch(
  candidates: readonly CandidateMessage[],
  config: ClassifierConfig,
  cache?: ResponseCache
): Promise<Result<ClassifiedActivity[]>> {
  const prompt = buildClassificationPrompt(candidates, {
    homeCountry: config.homeCountry,
    timezone: config.timezone
  })

  // Safety check: ensure prompt isn't too long
  const tokenCount = countTokens(prompt)
  if (tokenCount > MAX_BATCH_TOKENS) {
    return {
      ok: false,
      error: {
        type: 'invalid_request',
        message: `Batch too large: ${tokenCount} tokens exceeds limit of ${MAX_BATCH_TOKENS}.`
      }
    }
  }

  // Call provider with caching at HTTP layer
  const responseResult = await callProviderWithFallbacks(prompt, config, {
    cache,
    messageIds: candidates.map((c) => c.messageId),
    messageContents: candidates.map((c) => c.content)
  })

  if (!responseResult.ok) {
    return responseResult
  }

  try {
    const expectedIds = candidates.map((c) => c.messageId)
    const parsed = parseClassificationResponse(responseResult.value, expectedIds)

    // Map responses to candidates
    const suggestions: ClassifiedActivity[] = []

    for (const response of parsed) {
      const candidate = candidates.find((c) => c.messageId === response.msg)
      if (candidate) {
        suggestions.push(toClassifiedActivity(response, candidate))
      }
    }

    return { ok: true, value: suggestions }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: { type: 'invalid_response', message: `Failed to parse response: ${message}` }
    }
  }
}

/**
 * Classify candidate messages using AI.
 *
 * Uses smart batching to keep nearby candidates together in the same batch,
 * improving classification quality for planning discussions that span multiple messages.
 *
 * @param candidates Candidate messages to classify
 * @param config Classifier configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @returns Classified suggestions or error
 */
export async function classifyMessages(
  candidates: readonly CandidateMessage[],
  config: ClassifierConfig,
  cache?: ResponseCache
): Promise<Result<ClassifiedActivity[]>> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE
  const model = config.model ?? DEFAULT_MODELS[config.provider]
  const results: ClassifiedActivity[] = []

  // Simple batching - take candidates in order
  const batches: CandidateMessage[][] = []
  for (let i = 0; i < candidates.length; i += batchSize) {
    batches.push([...candidates.slice(i, i + batchSize)])
  }

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    if (!batch) continue

    // Call onBatchStart BEFORE the API call
    config.onBatchStart?.({
      batchIndex: i,
      totalBatches: batches.length,
      candidateCount: batch.length,
      model,
      provider: config.provider
    })

    const startTime = Date.now()
    const result = await classifyBatch(batch, config, cache)
    const durationMs = Date.now() - startTime

    if (!result.ok) {
      return result
    }

    // Call onBatchComplete with results
    config.onBatchComplete?.({
      batchIndex: i,
      totalBatches: batches.length,
      activityCount: result.value.length,
      durationMs
    })

    results.push(...result.value)
  }

  return { ok: true, value: results }
}

/**
 * Filter classified suggestions to only include activities.
 * Note: All items are activities now (no errands), so this just returns all.
 *
 * @param suggestions All classified suggestions
 * @returns All suggestions (kept for API compatibility)
 */
export function filterActivities(suggestions: readonly ClassifiedActivity[]): ClassifiedActivity[] {
  return [...suggestions]
}

/**
 * Group suggestions by category.
 */
export function groupByCategory(
  suggestions: readonly ClassifiedActivity[]
): Map<ActivityCategory, ClassifiedActivity[]> {
  const groups = new Map<ActivityCategory, ClassifiedActivity[]>()

  for (const suggestion of suggestions) {
    const existing = groups.get(suggestion.category) ?? []
    existing.push(suggestion)
    groups.set(suggestion.category, existing)
  }

  return groups
}
