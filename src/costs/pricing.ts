/**
 * Pricing Constants
 *
 * Centralized pricing data for all AI providers and services.
 * Prices are in micro-dollars (1/1,000,000 of a dollar) per unit.
 *
 * To convert: $0.001 per 1K tokens = 1 micro-dollar per token
 *
 * IMPORTANT: Keep these updated as provider pricing changes.
 * Last verified: 2025-01-01
 *
 * Pricing Sources:
 * - OpenAI: https://platform.openai.com/docs/pricing
 * - Anthropic: https://docs.anthropic.com/en/docs/about-claude/models (see pricing section)
 *              https://www.anthropic.com/pricing
 * - Google AI: https://ai.google.dev/gemini-api/docs/pricing
 * - Google Maps: https://developers.google.com/maps/billing-and-pricing/pricing
 */

import type {
  AIProvider,
  EmbeddingProvider,
  GeocodingProvider,
  MicroDollars,
  ModelPricing
} from './types'

// =============================================================================
// AI MODEL PRICING (per token in micro-dollars)
// =============================================================================

/**
 * AI model pricing for classification.
 * Prices are per token in micro-dollars.
 *
 * Sources:
 * - OpenAI: https://platform.openai.com/docs/pricing
 * - Anthropic: https://www.anthropic.com/pricing
 * - Google: https://ai.google.dev/gemini-api/docs/pricing
 */
export const AI_MODEL_PRICING: Record<string, ModelPricing> = {
  // Google AI (Gemini)
  // Source: https://ai.google.dev/gemini-api/docs/pricing
  // Gemini 3 Flash released Dec 17, 2025
  'gemini-3-flash-preview': {
    model: 'gemini-3-flash-preview',
    provider: 'google',
    inputTokenPrice: 0.5, // $0.50 per 1M tokens
    outputTokenPrice: 3.0, // $3.00 per 1M tokens
    contextWindow: 1_000_000,
    updatedAt: '2026-01-01'
  },
  'gemini-3-pro': {
    model: 'gemini-3-pro',
    provider: 'google',
    inputTokenPrice: 2.0, // $2.00 per 1M tokens
    outputTokenPrice: 12.0, // $12.00 per 1M tokens
    contextWindow: 1_000_000,
    updatedAt: '2026-01-01'
  },

  // Anthropic Claude
  // Source: https://www.anthropic.com/pricing
  //         https://docs.anthropic.com/en/docs/about-claude/models
  'claude-haiku-4-5': {
    model: 'claude-haiku-4-5',
    provider: 'anthropic',
    inputTokenPrice: 1.0, // $1.00 per 1M tokens
    outputTokenPrice: 5.0, // $5.00 per 1M tokens
    contextWindow: 200_000,
    updatedAt: '2026-01-01'
  },
  'claude-sonnet-4-5': {
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    inputTokenPrice: 3.0, // $3.00 per 1M tokens
    outputTokenPrice: 15.0, // $15.00 per 1M tokens
    contextWindow: 200_000,
    updatedAt: '2026-01-01'
  },
  'claude-opus-4-1': {
    model: 'claude-opus-4-1',
    provider: 'anthropic',
    inputTokenPrice: 15.0, // $15.00 per 1M tokens
    outputTokenPrice: 75.0, // $75.00 per 1M tokens
    contextWindow: 200_000,
    updatedAt: '2026-01-01'
  },

  // OpenAI
  // Source: https://platform.openai.com/docs/pricing
  'gpt-5-mini': {
    model: 'gpt-5-mini',
    provider: 'openai',
    inputTokenPrice: 0.25, // $0.25 per 1M tokens
    outputTokenPrice: 2.0, // $2.00 per 1M tokens
    contextWindow: 128_000,
    updatedAt: '2026-01-01'
  },
  'gpt-5': {
    model: 'gpt-5',
    provider: 'openai',
    inputTokenPrice: 1.25, // $1.25 per 1M tokens
    outputTokenPrice: 10.0, // $10.00 per 1M tokens
    contextWindow: 128_000,
    updatedAt: '2026-01-01'
  }
}

// =============================================================================
// EMBEDDING MODEL PRICING (per token in micro-dollars)
// =============================================================================

/**
 * Embedding model pricing.
 * Prices are per token in micro-dollars.
 *
 * Source: https://platform.openai.com/docs/pricing
 */
export const EMBEDDING_MODEL_PRICING: Record<string, ModelPricing> = {
  // Source: https://platform.openai.com/docs/pricing
  'text-embedding-3-small': {
    model: 'text-embedding-3-small',
    provider: 'openai',
    inputTokenPrice: 0.02, // $0.02 per 1M tokens
    contextWindow: 8191,
    updatedAt: '2025-01-01'
  },
  'text-embedding-3-large': {
    model: 'text-embedding-3-large',
    provider: 'openai',
    inputTokenPrice: 0.13, // $0.13 per 1M tokens
    contextWindow: 8191,
    updatedAt: '2025-01-01'
  },
  'text-embedding-ada-002': {
    model: 'text-embedding-ada-002',
    provider: 'openai',
    inputTokenPrice: 0.1, // $0.10 per 1M tokens
    contextWindow: 8191,
    updatedAt: '2025-01-01'
  }
}

// =============================================================================
// SERVICE PRICING (per request in micro-dollars)
// =============================================================================

/**
 * Google Maps/Places API pricing.
 * Prices are per request in micro-dollars.
 *
 * Google pricing tiers (as of 2025):
 * - 0-100K requests/month: Standard pricing (shown below)
 * - 100K+ requests/month: Volume discounts available
 *
 * IMPORTANT: Google restructured pricing in March 2025 with new SKU tiers:
 * - Essentials: Basic data, lower cost
 * - Pro: Contact + atmosphere data
 * - Enterprise: Full data access
 *
 * Prices below are for the "Pro" tier which includes the data we need.
 *
 * Source: https://developers.google.com/maps/billing-and-pricing/pricing
 * Calculator: https://mapsplatform.google.com/pricing/
 */
export const GOOGLE_MAPS_PRICING = {
  // Places API (New) - Pro tier pricing
  // Source: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
  placeDetails: 17_000 as MicroDollars, // $0.017 per request (Pro tier)
  placeSearch: 32_000 as MicroDollars, // $0.032 per request
  nearbySearch: 32_000 as MicroDollars, // $0.032 per request
  textSearch: 32_000 as MicroDollars, // $0.032 per request
  autocomplete: 2_830 as MicroDollars, // $0.00283 per request

  // Places Photos
  // Source: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
  placePhoto: 7_000 as MicroDollars, // $0.007 per photo

  // Geocoding API
  // Source: https://developers.google.com/maps/documentation/geocoding/usage-and-billing
  geocode: 5_000 as MicroDollars, // $0.005 per request
  reverseGeocode: 5_000 as MicroDollars, // $0.005 per request

  updatedAt: '2025-01-01'
} as const

/**
 * Image service pricing.
 * Prices are per request in micro-dollars.
 *
 * Sources:
 * - Pixabay: https://pixabay.com/api/docs/ (free for API usage)
 * - Pexels: https://www.pexels.com/api/documentation/ (free for API usage)
 * - Google Places Photos: See GOOGLE_MAPS_PRICING above
 */
export const IMAGE_SERVICE_PRICING = {
  // Pixabay (free tier, no cost)
  // Source: https://pixabay.com/api/docs/
  pixabaySearch: 0 as MicroDollars,

  // Pexels (free tier, no cost)
  // Source: https://www.pexels.com/api/documentation/
  pexelsSearch: 0 as MicroDollars,

  // Google Places Photos (from GOOGLE_MAPS_PRICING)
  googlePlacesPhoto: GOOGLE_MAPS_PRICING.placePhoto,

  updatedAt: '2025-01-01'
} as const

// =============================================================================
// DEFAULT MODELS
// =============================================================================

/**
 * Default models for each provider.
 * Used when no specific model is requested.
 *
 * IMPORTANT: Keep in sync with src/classifier/models.ts
 */
export const DEFAULT_AI_MODELS: Record<AIProvider, string> = {
  google: 'gemini-3-flash-preview',
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  openrouter: 'google/gemini-3-flash-preview' // OpenRouter uses provider/model format
}

export const DEFAULT_EMBEDDING_MODELS: Record<EmbeddingProvider, string> = {
  openai: 'text-embedding-3-large', // Default in src/extraction/embeddings/index.ts
  google: 'text-embedding-004' // Not yet priced, use OpenAI for now
}

export const DEFAULT_GEOCODING_PROVIDER: GeocodingProvider = 'google_places'

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get pricing for an AI model.
 * Falls back to default model for provider if not found.
 */
export function getAIModelPricing(model: string): ModelPricing | null {
  return AI_MODEL_PRICING[model] ?? null
}

/**
 * Get pricing for an embedding model.
 */
export function getEmbeddingModelPricing(model: string): ModelPricing | null {
  return EMBEDDING_MODEL_PRICING[model] ?? null
}

/**
 * Get the default model for a provider.
 */
export function getDefaultAIModel(provider: AIProvider): string {
  return DEFAULT_AI_MODELS[provider]
}

/**
 * Get the default embedding model for a provider.
 */
export function getDefaultEmbeddingModel(provider: EmbeddingProvider): string {
  return DEFAULT_EMBEDDING_MODELS[provider]
}

/**
 * List all available AI models.
 */
export function listAIModels(): string[] {
  return Object.keys(AI_MODEL_PRICING)
}

/**
 * List all available embedding models.
 */
export function listEmbeddingModels(): string[] {
  return Object.keys(EMBEDDING_MODEL_PRICING)
}
