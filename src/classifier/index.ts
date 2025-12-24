/**
 * Classifier Module
 *
 * Use AI to determine if candidates are actual "things to do"
 * and extract activity/location details.
 */

import { generateClassifierCacheKey } from '../cache/key'
import type { ResponseCache } from '../cache/types'
import type {
  ActivityCategory,
  CandidateMessage,
  ClassifiedActivity,
  ClassifierConfig,
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

export { createSmartBatches, groupCandidatesByProximity } from './batching'
export type { ResolvedModel } from './models'
export { getRequiredApiKeyEnvVar, getValidModelIds, resolveModel } from './models'
export {
  buildClassificationPrompt,
  type ClassificationContext,
  parseClassificationResponse
} from './prompt'

import { VALID_CATEGORIES } from '../categories'
import { generateActivityId } from '../types/activity-id'

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
  // Capitalize first letter of title
  const title = response.title ?? candidate.content.slice(0, 100)
  const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1)

  // Build activity without ID first
  const funScore = response.fun
  const interestingScore = response.int
  const score = interestingScore * 2 + funScore

  const activity = {
    messageId: candidate.messageId,
    activity: capitalizedTitle,
    funScore,
    interestingScore,
    score,
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
    country: response.country,
    imageKeywords: response.kw
  }

  // Generate deterministic ID from all fields
  const activityId = generateActivityId(activity)

  return { activityId, ...activity }
}

/**
 * Classify a batch of candidates.
 * Caching is handled by the provider layer (callProviderWithFallbacks).
 *
 * This is the core classification function - processes a single batch.
 * For parallel processing, CLI uses a worker pool that calls this function.
 */
export async function classifyBatch(
  candidates: readonly CandidateMessage[],
  config: ClassifierConfig,
  cache?: ResponseCache
): Promise<Result<ClassifiedActivity[]>> {
  const prompt = buildClassificationPrompt(candidates, {
    homeCountry: config.homeCountry,
    timezone: config.timezone,
    urlMetadata: config.urlMetadata
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

  // Process batches sequentially (CLI uses worker pool for parallelism)
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    if (!batch) continue

    // Check cache BEFORE calling onBatchStart
    const messages = batch.map((c) => ({ messageId: c.messageId, content: c.content }))
    const cacheKey = generateClassifierCacheKey(config.provider, model, messages)
    const cached = cache ? await cache.get<string>(cacheKey) : null

    config.onBatchStart?.({
      batchIndex: i,
      totalBatches: batches.length,
      candidateCount: batch.length,
      model,
      provider: config.provider,
      fromCache: cached !== null
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
 * Sort activities by score (highest first).
 */
export function sortActivitiesByScore(
  activities: readonly ClassifiedActivity[]
): ClassifiedActivity[] {
  return [...activities].sort((a, b) => b.score - a.score)
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
