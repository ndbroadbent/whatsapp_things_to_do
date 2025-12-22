/**
 * Classifier Module
 *
 * Use AI to determine if candidates are actual "things to do"
 * and extract activity/location details.
 */

import { generateClassifierCacheKey } from '../cache/key.js'
import { DEFAULT_CACHE_TTL_SECONDS } from '../cache/types.js'
import type {
  ActivityCategory,
  CandidateMessage,
  ClassifiedActivity,
  ClassifierConfig,
  ResponseCache,
  Result
} from '../types.js'
import { DEFAULT_MODELS } from './models.js'
import {
  buildClassificationPrompt,
  type ParsedClassification,
  parseClassificationResponse
} from './prompt.js'
import { callProviderWithFallbacks } from './providers.js'
import { countTokens, MAX_BATCH_TOKENS } from './tokenizer.js'

export {
  createSmartBatches,
  createTokenAwareBatches,
  groupCandidatesByProximity
} from './batching.js'
export type { ResolvedModel } from './models.js'
export { getRequiredApiKeyEnvVar, getValidModelIds, resolveModel } from './models.js'
export {
  buildClassificationPrompt,
  type ClassificationContext,
  parseClassificationResponse
} from './prompt.js'

const DEFAULT_BATCH_SIZE = 10

const VALID_CATEGORIES: readonly ActivityCategory[] = [
  'restaurant',
  'cafe',
  'bar',
  'hike',
  'nature',
  'beach',
  'trip',
  'hotel',
  'event',
  'concert',
  'museum',
  'entertainment',
  'adventure',
  'family',
  'errand',
  'appointment',
  'other'
]

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
    isActivity: response.is_act,
    activity: response.title ?? candidate.content.slice(0, 100),
    activityScore: response.score,
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

interface ClassifyBatchResult {
  result: Result<ClassifiedActivity[]>
  cacheHit: boolean
  cacheKey: string
}

/**
 * Classify a batch of candidates.
 */
async function classifyBatch(
  candidates: readonly CandidateMessage[],
  config: ClassifierConfig,
  cache?: ResponseCache
): Promise<ClassifyBatchResult> {
  const model = config.model ?? DEFAULT_MODELS[config.provider]

  // Generate cache key
  const cacheKey = generateClassifierCacheKey(
    config.provider,
    model,
    candidates.map((c) => ({ messageId: c.messageId, content: c.content }))
  )

  // Check cache first
  if (cache) {
    const cached = await cache.get<ClassifiedActivity[]>(cacheKey)
    if (cached) {
      return { result: { ok: true, value: cached.data }, cacheHit: true, cacheKey }
    }
  }

  const prompt = buildClassificationPrompt(candidates, {
    homeCountry: config.homeCountry,
    timezone: config.timezone
  })

  // Safety check: ensure prompt isn't too long
  const tokenCount = countTokens(prompt)
  if (tokenCount > MAX_BATCH_TOKENS) {
    return {
      result: {
        ok: false,
        error: {
          type: 'invalid_request',
          message: `Batch too large: ${tokenCount} tokens exceeds limit of ${MAX_BATCH_TOKENS}.`
        }
      },
      cacheHit: false,
      cacheKey
    }
  }

  const responseResult = await callProviderWithFallbacks(prompt, config)
  if (!responseResult.ok) {
    return { result: responseResult, cacheHit: false, cacheKey }
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

    // Cache the results
    if (cache) {
      await cache.set(
        cacheKey,
        { data: suggestions, cachedAt: Date.now() },
        DEFAULT_CACHE_TTL_SECONDS
      )
    }

    return { result: { ok: true, value: suggestions }, cacheHit: false, cacheKey }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      result: {
        ok: false,
        error: { type: 'invalid_response', message: `Failed to parse response: ${message}` }
      },
      cacheHit: false,
      cacheKey
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
    const { result, cacheHit, cacheKey } = await classifyBatch(batch, config, cache)
    const durationMs = Date.now() - startTime

    // Call onCacheCheck for debug logging
    config.onCacheCheck?.({ batchIndex: i, cacheKey, hit: cacheHit })

    if (!result.ok) {
      return result
    }

    // Call onBatchComplete with results
    const activityCount = result.value.filter((s) => s.isActivity).length
    config.onBatchComplete?.({
      batchIndex: i,
      totalBatches: batches.length,
      activityCount,
      durationMs
    })

    results.push(...result.value)
  }

  return { ok: true, value: results }
}

/**
 * Filter classified suggestions to only include activities.
 *
 * @param suggestions All classified suggestions
 * @param minActivityScore Minimum activity score (default: 0.5)
 * @returns Only activity suggestions (not errands)
 */
export function filterActivities(
  suggestions: readonly ClassifiedActivity[],
  minActivityScore = 0.5
): ClassifiedActivity[] {
  return suggestions.filter((s) => s.isActivity && s.activityScore >= minActivityScore)
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
