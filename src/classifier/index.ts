/**
 * Classifier Module
 *
 * Use AI to determine if candidates are actual "things to do"
 * and extract activity/location details.
 */

import { generateClassifierCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import {
  type ActivityCategory,
  type CandidateMessage,
  type ClassifiedActivity,
  type ClassifierConfig,
  calculateCombinedScore,
  type Result
} from '../types'
import { DEFAULT_MODELS } from './models'
import {
  buildClassificationPrompt,
  type ParsedClassification,
  type PromptType,
  parseClassificationResponse,
  separateCandidatesByType
} from './prompt'
import { callProviderWithFallbacks } from './providers'
import { countTokens, MAX_BATCH_TOKENS } from './tokenizer'

export { createSmartBatches, groupCandidatesByProximity } from './batching'
export type { ResolvedModel } from './models'
export { DEFAULT_MODEL_ID, getRequiredApiKeyEnvVar, getValidModelIds, resolveModel } from './models'
export {
  buildClassificationPrompt,
  type ClassificationContext,
  parseClassificationResponse
} from './prompt'

import { VALID_CATEGORIES } from '../categories'
import { generateActivityId } from '../types/activity-id'
import { resolveMessageWithOffset } from './message-offset'

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
 * Returns null if the activity has no action (invalid/incomplete classification).
 */
function toClassifiedActivity(
  response: ParsedClassification,
  candidate: CandidateMessage
): ClassifiedActivity | null {
  // Action is required - if empty, the classification is invalid
  if (!response.act || response.act.trim() === '') {
    console.warn(
      `[classifier] Discarding activity with empty action: msg=${response.msg}, title="${response.title}"`
    )
    return null
  }

  // Resolve the actual message using offset (for [AGREE] candidates pointing to earlier messages)
  const resolvedMessage = resolveMessageWithOffset(candidate, response.off)

  // Capitalize first letter of title
  const title = response.title ?? resolvedMessage.content.slice(0, 100)
  const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1)

  // Build activity without ID first
  // Scores are 0-5 scale from the AI
  const funScore = response.fun
  const interestingScore = response.int
  const score = calculateCombinedScore(funScore, interestingScore)

  const activity = {
    activity: capitalizedTitle,
    funScore,
    interestingScore,
    score,
    category: normalizeCategory(response.cat),
    confidence: response.conf,
    messages: [
      {
        id: candidate.messageId,
        timestamp: candidate.timestamp,
        sender: resolvedMessage.sender,
        message: resolvedMessage.content
      }
    ],
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
 *
 * @param candidates Candidates to classify (should all be same type for best results)
 * @param config Classifier configuration
 * @param cache Optional response cache
 * @param promptType Optional prompt type override (auto-detected if not specified)
 */
export async function classifyBatch(
  candidates: readonly CandidateMessage[],
  config: ClassifierConfig,
  cache?: ResponseCache,
  promptType?: PromptType
): Promise<Result<ClassifiedActivity[]>> {
  const prompt = buildClassificationPrompt(
    candidates,
    {
      homeCountry: config.homeCountry,
      timezone: config.timezone,
      urlMetadata: config.urlMetadata
    },
    promptType
  )

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

    // Map responses to candidates, filtering out invalid classifications
    const suggestions: ClassifiedActivity[] = []

    for (const response of parsed) {
      const candidate = candidates.find((c) => c.messageId === response.msg)
      if (candidate) {
        const activity = toClassifiedActivity(response, candidate)
        if (activity) {
          suggestions.push(activity)
        }
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
 * Create batches from candidates with specified size.
 */
function createBatches(
  candidates: readonly CandidateMessage[],
  batchSize: number
): CandidateMessage[][] {
  const batches: CandidateMessage[][] = []
  for (let i = 0; i < candidates.length; i += batchSize) {
    batches.push([...candidates.slice(i, i + batchSize)])
  }
  return batches
}

/**
 * Process batches of a specific type.
 */
async function processBatches(
  batches: CandidateMessage[][],
  promptType: PromptType,
  config: ClassifierConfig,
  cache: ResponseCache | undefined,
  model: string,
  batchIndexOffset: number,
  totalBatches: number
): Promise<Result<ClassifiedActivity[]>> {
  const results: ClassifiedActivity[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    if (!batch) continue

    const globalBatchIndex = batchIndexOffset + i

    // Check cache BEFORE calling onBatchStart
    const messages = batch.map((c) => ({ messageId: c.messageId, content: c.content }))
    const cacheKey = generateClassifierCacheKey(config.provider, model, messages)
    const cached = cache ? await cache.get<string>(cacheKey) : null

    config.onBatchStart?.({
      batchIndex: globalBatchIndex,
      totalBatches,
      candidateCount: batch.length,
      model,
      provider: config.provider,
      fromCache: cached !== null
    })

    const startTime = Date.now()
    const result = await classifyBatch(batch, config, cache, promptType)
    const durationMs = Date.now() - startTime

    if (!result.ok) {
      return result
    }

    config.onBatchComplete?.({
      batchIndex: globalBatchIndex,
      totalBatches,
      activityCount: result.value.length,
      durationMs
    })

    results.push(...result.value)
  }

  return { ok: true, value: results }
}

/**
 * Classify candidate messages using AI.
 *
 * Separates candidates into suggestions and agreements, processing each type
 * with a specialized prompt for better accuracy with smaller models.
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

  // Separate candidates by type for specialized prompts
  const { suggestions, agreements } = separateCandidatesByType(candidates)

  // Create batches for each type
  const suggestionBatches = createBatches(suggestions, batchSize)
  const agreementBatches = createBatches(agreements, batchSize)
  const totalBatches = suggestionBatches.length + agreementBatches.length

  const results: ClassifiedActivity[] = []

  // Process suggestion batches first
  if (suggestionBatches.length > 0) {
    const suggestionResult = await processBatches(
      suggestionBatches,
      'suggestion',
      config,
      cache,
      model,
      0,
      totalBatches
    )
    if (!suggestionResult.ok) {
      return suggestionResult
    }
    results.push(...suggestionResult.value)
  }

  // Process agreement batches
  if (agreementBatches.length > 0) {
    const agreementResult = await processBatches(
      agreementBatches,
      'agreement',
      config,
      cache,
      model,
      suggestionBatches.length,
      totalBatches
    )
    if (!agreementResult.ok) {
      return agreementResult
    }
    results.push(...agreementResult.value)
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
