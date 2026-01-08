/**
 * AI Provider API Clients
 *
 * HTTP clients for Anthropic, OpenAI, and OpenRouter APIs.
 * Caching happens here - at the HTTP layer where we have access to both prompt and response.
 */

import { generateClassifierCacheKey } from '../caching/key'
import type { ResponseCache } from '../caching/types'
import { emptyResponseError, handleHttpError, handleNetworkError, httpFetch } from '../http'
import type { ClassifierConfig, ProviderConfig, Result } from '../types'
import { DEFAULT_MODELS } from './models'

interface ProviderCallOptions {
  cache?: ResponseCache | undefined
  /** Message IDs for cache key generation */
  messageIds?: readonly number[]
  /** Message contents for cache key generation */
  messageContents?: readonly string[]
}

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
  usage: { input_tokens: number; output_tokens: number }
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>
  usage: { prompt_tokens: number; completion_tokens: number }
}

interface GoogleAIResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }>; role: string }
  }>
  usageMetadata: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

/**
 * Call Google AI (Gemini) API for classification.
 */
async function callGoogleAI(prompt: string, config: ProviderConfig): Promise<Result<string>> {
  const model = config.model ?? DEFAULT_MODELS.google
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`

  try {
    const response = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 16384,
          thinkingConfig: { thinkingLevel: 'minimal' }
        }
      })
    })

    if (!response.ok) return handleHttpError(response)

    const data = (await response.json()) as GoogleAIResponse
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? { ok: true, value: text } : emptyResponseError()
  } catch (error) {
    return handleNetworkError(error)
  }
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
  defaultModel: string,
  isOpenRouter = false
): Promise<Result<string>> {
  const model = config.model ?? defaultModel

  // Build request body
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_completion_tokens: 16384
  }

  // For OpenRouter with Gemini models, disable thinking for faster responses
  if (isOpenRouter && model.includes('gemini')) {
    body.provider = {
      google: {
        generationConfig: {
          thinkingConfig: { thinkingLevel: 'minimal' }
        }
      }
    }
  }

  try {
    const response = await httpFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body)
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
 * Call a single AI provider with optional caching.
 * Caching happens here at the HTTP layer where we have both prompt and response.
 */
async function callProvider(
  prompt: string,
  providerConfig: ProviderConfig,
  options?: ProviderCallOptions
): Promise<Result<string>> {
  const model = providerConfig.model ?? DEFAULT_MODELS[providerConfig.provider]
  const cache = options?.cache

  // Generate cache key if we have the required info
  let cacheKey: string | undefined
  if (cache && options?.messageIds && options?.messageContents) {
    const messages = options.messageIds.map((id, i) => ({
      messageId: id,
      content: options.messageContents?.[i] ?? ''
    }))
    cacheKey = generateClassifierCacheKey(providerConfig.provider, model, messages)

    // Check cache
    const cached = await cache.get<string>(cacheKey)
    if (cached) {
      return { ok: true, value: cached.data }
    }
  }

  // Make the actual API call
  let result: Result<string>
  switch (providerConfig.provider) {
    case 'google':
      result = await callGoogleAI(prompt, providerConfig)
      break
    case 'anthropic':
      result = await callAnthropic(prompt, providerConfig)
      break
    case 'openai':
      result = await callOpenAICompatible(
        'https://api.openai.com/v1/chat/completions',
        prompt,
        providerConfig,
        DEFAULT_MODELS.openai
      )
      break
    case 'openrouter':
      result = await callOpenAICompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        prompt,
        providerConfig,
        DEFAULT_MODELS.openrouter,
        true // isOpenRouter - enables provider-specific config
      )
      break
    default:
      return {
        ok: false,
        error: {
          type: 'invalid_response',
          message: `Unknown provider: ${providerConfig.provider}`
        }
      }
  }

  // Cache successful response + prompt
  if (result.ok && cache && cacheKey) {
    await cache.set(cacheKey, { data: result.value, cachedAt: Date.now() })
    await cache.setPrompt?.(cacheKey, prompt)
  }

  return result
}

/**
 * Call provider with automatic fallback on rate limit errors.
 * Tries the primary provider first, then each fallback in order.
 */
export async function callProviderWithFallbacks(
  prompt: string,
  config: ClassifierConfig,
  options?: ProviderCallOptions
): Promise<Result<string>> {
  const primaryConfig: ProviderConfig = {
    provider: config.provider,
    apiKey: config.apiKey,
    ...(config.model !== undefined && { model: config.model })
  }

  const result = await callProvider(prompt, primaryConfig, options)

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
    const fallbackResult = await callProvider(prompt, fallbackConfig, options)

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
