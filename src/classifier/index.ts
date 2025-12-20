/**
 * Classifier Module
 *
 * Use AI to determine if candidates are actual "things to do"
 * and extract activity/location details.
 */

import { generateClassifierCacheKey } from '../cache/key.js'
import { DEFAULT_CACHE_TTL_SECONDS } from '../cache/types.js'
import { emptyResponseError, handleHttpError, handleNetworkError, httpFetch } from '../http.js'
import type {
  ActivityCategory,
  CandidateMessage,
  ClassifiedSuggestion,
  ClassifierConfig,
  ClassifierProvider,
  ClassifierResponse,
  ProviderConfig,
  ResponseCache,
  Result
} from '../types.js'
import { buildClassificationPrompt, parseClassificationResponse } from './prompt.js'
import { countTokens, MAX_BATCH_TOKENS } from './tokenizer.js'

export {
  createSmartBatches,
  createTokenAwareBatches,
  groupCandidatesByProximity
} from './batching.js'
export { buildClassificationPrompt, parseClassificationResponse } from './prompt.js'

const DEFAULT_BATCH_SIZE = 10

const DEFAULT_MODELS: Record<ClassifierProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  openrouter: 'anthropic/claude-haiku-4.5'
}

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

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>
  usage: { prompt_tokens: number; completion_tokens: number }
}

/**
 * Call Anthropic Claude API for classification.
 */
async function callAnthropic(prompt: string, config: ProviderConfig): Promise<Result<string>> {
  const model = config.model ?? DEFAULT_MODELS.anthropic

  try {
    const response = await httpFetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 16384,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (!response.ok) return handleHttpError(response)

    const data = (await response.json()) as AnthropicResponse
    const text = data.content[0]?.text
    return text ? { ok: true, value: text } : emptyResponseError()
  } catch (error) {
    return handleNetworkError(error)
  }
}

/**
 * Call OpenAI-compatible API (OpenAI or OpenRouter).
 */
async function callOpenAICompatible(
  url: string,
  prompt: string,
  config: ProviderConfig,
  defaultModel: string
): Promise<Result<string>> {
  const model = config.model ?? defaultModel

  try {
    const response = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_completion_tokens: 16384
      })
    })

    if (!response.ok) return handleHttpError(response)

    const data = (await response.json()) as OpenAIResponse
    const text = data.choices[0]?.message?.content
    return text ? { ok: true, value: text } : emptyResponseError()
  } catch (error) {
    return handleNetworkError(error)
  }
}

/**
 * Call a single AI provider.
 */
async function callProvider(
  prompt: string,
  providerConfig: ProviderConfig
): Promise<Result<string>> {
  switch (providerConfig.provider) {
    case 'anthropic':
      return callAnthropic(prompt, providerConfig)
    case 'openai':
      return callOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        prompt,
        providerConfig,
        DEFAULT_MODELS.openai
      )
    case 'openrouter':
      return callOpenAICompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        prompt,
        providerConfig,
        DEFAULT_MODELS.openrouter
      )
    default:
      return {
        ok: false,
        error: { type: 'invalid_response', message: `Unknown provider: ${providerConfig.provider}` }
      }
  }
}

/**
 * Call provider with automatic fallback on rate limit errors.
 * Tries the primary provider first, then each fallback in order.
 */
async function callProviderWithFallbacks(
  prompt: string,
  config: ClassifierConfig
): Promise<Result<string>> {
  const primaryConfig: ProviderConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    ...(config.model !== undefined && { model: config.model })
  }

  const result = await callProvider(prompt, primaryConfig)

  // If successful or not a rate limit error, return immediately
  if (result.ok || result.error.type !== 'rate_limit') {
    return result
  }

  // No fallbacks configured
  if (!config.fallbackProviders || config.fallbackProviders.length === 0) {
    return result
  }

  // Try each fallback provider in order
  for (const fallbackConfig of config.fallbackProviders) {
    const fallbackResult = await callProvider(prompt, fallbackConfig)

    // If successful or not a rate limit error, return
    if (fallbackResult.ok || fallbackResult.error.type !== 'rate_limit') {
      return fallbackResult
    }
  }

  // All providers rate limited - return the original error
  return {
    ok: false,
    error: {
      type: 'rate_limit',
      message: 'All providers rate limited (primary and fallbacks)'
    }
  }
}

/**
 * Convert a classifier response to a classified suggestion.
 */
function toClassifiedSuggestion(
  response: ClassifierResponse,
  candidate: CandidateMessage
): ClassifiedSuggestion {
  return {
    messageId: candidate.messageId,
    isActivity: response.is_activity,
    activity: response.activity ?? candidate.content.slice(0, 100),
    location: response.location ?? undefined,
    activityScore: response.activity_score,
    category: normalizeCategory(response.category),
    confidence: response.confidence,
    originalMessage: candidate.content,
    sender: candidate.sender,
    timestamp: candidate.timestamp,
    isMappable: response.is_mappable
  }
}

interface ClassifyBatchResult {
  result: Result<ClassifiedSuggestion[]>
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
    const cached = await cache.get<ClassifiedSuggestion[]>(cacheKey)
    if (cached) {
      return { result: { ok: true, value: cached.data }, cacheHit: true, cacheKey }
    }
  }

  const prompt = buildClassificationPrompt(candidates)

  // Safety check: ensure prompt isn't too long
  const tokenCount = countTokens(prompt)
  if (tokenCount > MAX_BATCH_TOKENS) {
    return {
      result: {
        ok: false,
        error: {
          type: 'invalid_request',
          message: `Batch too large: ${tokenCount} tokens exceeds limit of ${MAX_BATCH_TOKENS}. Reduce batch size.`
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
    const suggestions: ClassifiedSuggestion[] = []

    for (const response of parsed) {
      const candidate = candidates.find((c) => c.messageId === response.message_id)
      if (candidate) {
        suggestions.push(toClassifiedSuggestion(response, candidate))
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
): Promise<Result<ClassifiedSuggestion[]>> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE
  const model = config.model ?? DEFAULT_MODELS[config.provider]
  const results: ClassifiedSuggestion[] = []

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
  suggestions: readonly ClassifiedSuggestion[],
  minActivityScore = 0.5
): ClassifiedSuggestion[] {
  return suggestions.filter((s) => s.isActivity && s.activityScore >= minActivityScore)
}

/**
 * Group suggestions by category.
 */
export function groupByCategory(
  suggestions: readonly ClassifiedSuggestion[]
): Map<ActivityCategory, ClassifiedSuggestion[]> {
  const groups = new Map<ActivityCategory, ClassifiedSuggestion[]>()

  for (const suggestion of suggestions) {
    const existing = groups.get(suggestion.category) ?? []
    existing.push(suggestion)
    groups.set(suggestion.category, existing)
  }

  return groups
}
