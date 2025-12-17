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
  ClassifierResponse,
  ResponseCache,
  Result
} from '../types.js'
import { createSmartBatches } from './batching.js'
import { buildClassificationPrompt, parseClassificationResponse } from './prompt.js'

export { createSmartBatches, groupCandidatesByProximity } from './batching.js'
export { buildClassificationPrompt, parseClassificationResponse } from './prompt.js'

const DEFAULT_BATCH_SIZE = 10

const DEFAULT_MODELS: Record<ClassifierConfig['provider'], string> = {
  anthropic: 'claude-3-haiku-20240307',
  openai: 'gpt-4o-mini',
  openrouter: 'anthropic/claude-3-haiku'
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
async function callAnthropic(prompt: string, config: ClassifierConfig): Promise<Result<string>> {
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
        max_tokens: 4096,
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
  config: ClassifierConfig,
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
        max_tokens: 4096
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
 * Call the configured AI provider.
 */
async function callProvider(prompt: string, config: ClassifierConfig): Promise<Result<string>> {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(prompt, config)
    case 'openai':
      return callOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        prompt,
        config,
        DEFAULT_MODELS.openai
      )
    case 'openrouter':
      return callOpenAICompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        prompt,
        config,
        DEFAULT_MODELS.openrouter
      )
    default:
      return {
        ok: false,
        error: { type: 'invalid_response', message: `Unknown provider: ${config.provider}` }
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

/**
 * Classify a batch of candidates.
 */
async function classifyBatch(
  candidates: readonly CandidateMessage[],
  config: ClassifierConfig,
  cache?: ResponseCache
): Promise<Result<ClassifiedSuggestion[]>> {
  const model = config.model ?? DEFAULT_MODELS[config.provider]

  // Check cache first
  const cacheKey = generateClassifierCacheKey(
    config.provider,
    model,
    candidates.map((c) => ({ messageId: c.messageId, content: c.content }))
  )

  if (cache) {
    const cached = await cache.get<ClassifiedSuggestion[]>(cacheKey)
    if (cached) {
      return { ok: true, value: cached.data }
    }
  }

  const prompt = buildClassificationPrompt(candidates)
  const responseResult = await callProvider(prompt, config)
  if (!responseResult.ok) {
    return responseResult
  }

  try {
    const parsed = parseClassificationResponse(responseResult.value)

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
): Promise<Result<ClassifiedSuggestion[]>> {
  const batchSize = config.batchSize ?? DEFAULT_BATCH_SIZE
  const proximityGap = config.proximityGap ?? 5
  const results: ClassifiedSuggestion[] = []

  // Use smart batching to keep nearby candidates together
  const batches = createSmartBatches(candidates, batchSize, proximityGap)

  for (const batch of batches) {
    const batchResult = await classifyBatch(batch, config, cache)
    if (!batchResult.ok) {
      return batchResult
    }

    results.push(...batchResult.value)
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
