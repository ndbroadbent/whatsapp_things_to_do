/**
 * Model Resolution
 *
 * Maps simple model IDs to providers and API model names.
 * Update the LATEST_* constants when new models are released.
 */

import type { ClassifierProvider } from '../types'

// =============================================================================
// LATEST MODEL API IDs - Update these when new models are released
// =============================================================================

/** Latest small/fast Google AI model (direct API) */
export const LATEST_GOOGLE_SMALL = 'gemini-3-flash-preview'

/** Latest small/fast Anthropic model */
const LATEST_ANTHROPIC_SMALL = 'claude-haiku-4-5'

/** Latest small/fast OpenAI model */
const LATEST_OPENAI_SMALL = 'gpt-5-mini'

// =============================================================================
// MODEL RESOLUTION
// =============================================================================

/**
 * Model resolution result.
 */
export interface ResolvedModel {
  provider: ClassifierProvider
  apiModel: string
}

/**
 * Model ID to provider/API model mapping.
 * Simple convention: model ID determines provider.
 */
const MODEL_MAP: Record<string, ResolvedModel> = {
  // Google AI (direct API) - primary for SaaS
  'gemini-3-flash': { provider: 'google', apiModel: LATEST_GOOGLE_SMALL },
  // OpenRouter fallback (same model via OpenRouter)
  'gemini-3-flash-or': {
    provider: 'openrouter',
    apiModel: `google/${LATEST_GOOGLE_SMALL}`
  },
  // Anthropic
  'haiku-4.5': { provider: 'anthropic', apiModel: LATEST_ANTHROPIC_SMALL },
  'haiku-4.5-or': {
    provider: 'openrouter',
    apiModel: 'anthropic/claude-3-5-haiku-latest'
  },
  // OpenAI
  'gpt-5-mini': { provider: 'openai', apiModel: LATEST_OPENAI_SMALL }
}

/** The default model ID used by the CLI when no model is specified. */
export const DEFAULT_MODEL_ID = 'gemini-3-flash'

/** Default API model for each provider (used when provider is specified but not model). */
export const DEFAULT_MODELS: Record<ClassifierProvider, string> = {
  google: LATEST_GOOGLE_SMALL,
  anthropic: LATEST_ANTHROPIC_SMALL,
  openai: LATEST_OPENAI_SMALL,
  openrouter: `google/${LATEST_GOOGLE_SMALL}`
}

/**
 * Get all valid model IDs.
 */
export function getValidModelIds(): string[] {
  return Object.keys(MODEL_MAP)
}

/**
 * Resolve a simple model ID to provider and API model.
 * @param modelId Simple model ID (e.g., 'gemini-3-flash', 'haiku-4.5')
 * @returns Provider and API model, or null if unknown
 */
export function resolveModel(modelId: string): ResolvedModel | null {
  return MODEL_MAP[modelId] ?? null
}

/**
 * Get the required API key environment variable for a model.
 */
export function getRequiredApiKeyEnvVar(modelId: string): string | null {
  const resolved = resolveModel(modelId)
  if (!resolved) return null
  switch (resolved.provider) {
    case 'google':
      return 'GOOGLE_AI_API_KEY'
    case 'openrouter':
      return 'OPENROUTER_API_KEY'
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'openai':
      return 'OPENAI_API_KEY'
  }
}
