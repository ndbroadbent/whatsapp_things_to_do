/**
 * Model Resolution
 *
 * Maps simple model IDs to providers and API model names.
 */

import type { ClassifierProvider } from '../types.js'

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
  'gemini-2.5-flash': { provider: 'openrouter', apiModel: 'google/gemini-2.5-flash' },
  'haiku-4.5': { provider: 'anthropic', apiModel: 'claude-haiku-4-5' },
  'haiku-4.5-or': { provider: 'openrouter', apiModel: 'anthropic/claude-3-5-haiku-latest' },
  'gpt-5-mini': { provider: 'openai', apiModel: 'gpt-5-mini' }
}

/** Default models for each provider. */
export const DEFAULT_MODELS: Record<ClassifierProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  openrouter: 'google/gemini-2.5-flash'
}

/**
 * Get all valid model IDs.
 */
export function getValidModelIds(): string[] {
  return Object.keys(MODEL_MAP)
}

/**
 * Resolve a simple model ID to provider and API model.
 * @param modelId Simple model ID (e.g., 'gemini-2.5-flash', 'haiku-4.5')
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
    case 'openrouter':
      return 'OPENROUTER_API_KEY'
    case 'anthropic':
      return 'ANTHROPIC_API_KEY'
    case 'openai':
      return 'OPENAI_API_KEY'
  }
}
