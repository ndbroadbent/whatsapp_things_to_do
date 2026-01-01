/**
 * Tests for pricing constants and helpers
 */

import { describe, expect, it } from 'vitest'
import {
  AI_MODEL_PRICING,
  DEFAULT_AI_MODELS,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_GEOCODING_PROVIDER,
  EMBEDDING_MODEL_PRICING,
  GOOGLE_MAPS_PRICING,
  getAIModelPricing,
  getDefaultAIModel,
  getDefaultEmbeddingModel,
  getEmbeddingModelPricing,
  IMAGE_SERVICE_PRICING,
  listAIModels,
  listEmbeddingModels
} from './pricing'

describe('AI_MODEL_PRICING', () => {
  it('should have pricing for all major models', () => {
    expect(AI_MODEL_PRICING['gemini-3-flash-preview']).toBeDefined()
    expect(AI_MODEL_PRICING['claude-haiku-4-5']).toBeDefined()
    expect(AI_MODEL_PRICING['gpt-5-mini']).toBeDefined()
  })

  it('should have valid input and output token prices', () => {
    for (const [_model, pricing] of Object.entries(AI_MODEL_PRICING)) {
      expect(pricing.inputTokenPrice).toBeGreaterThan(0)
      expect(pricing.outputTokenPrice).toBeGreaterThan(0)
      expect(pricing.outputTokenPrice).toBeGreaterThanOrEqual(pricing.inputTokenPrice ?? 0)
    }
  })

  it('should have valid context windows', () => {
    for (const [_model, pricing] of Object.entries(AI_MODEL_PRICING)) {
      if (pricing.contextWindow) {
        expect(pricing.contextWindow).toBeGreaterThan(0)
      }
    }
  })

  it('should have updatedAt dates', () => {
    for (const [_model, pricing] of Object.entries(AI_MODEL_PRICING)) {
      expect(pricing.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

describe('EMBEDDING_MODEL_PRICING', () => {
  it('should have pricing for OpenAI embedding models', () => {
    expect(EMBEDDING_MODEL_PRICING['text-embedding-3-small']).toBeDefined()
    expect(EMBEDDING_MODEL_PRICING['text-embedding-3-large']).toBeDefined()
    expect(EMBEDDING_MODEL_PRICING['text-embedding-ada-002']).toBeDefined()
  })

  it('should have valid token prices', () => {
    for (const [_model, pricing] of Object.entries(EMBEDDING_MODEL_PRICING)) {
      expect(pricing.inputTokenPrice).toBeGreaterThan(0)
    }
  })

  it('text-embedding-3-small should be cheaper than 3-large', () => {
    const small = EMBEDDING_MODEL_PRICING['text-embedding-3-small']
    const large = EMBEDDING_MODEL_PRICING['text-embedding-3-large']
    expect(small?.inputTokenPrice).toBeLessThan(large?.inputTokenPrice ?? 0)
  })
})

describe('GOOGLE_MAPS_PRICING', () => {
  it('should have pricing for all services', () => {
    expect(GOOGLE_MAPS_PRICING.placeDetails).toBeGreaterThan(0)
    expect(GOOGLE_MAPS_PRICING.placeSearch).toBeGreaterThan(0)
    expect(GOOGLE_MAPS_PRICING.geocode).toBeGreaterThan(0)
    expect(GOOGLE_MAPS_PRICING.placePhoto).toBeGreaterThan(0)
  })

  it('should have correct relative pricing', () => {
    // Geocoding is cheaper than Place Details
    expect(GOOGLE_MAPS_PRICING.geocode).toBeLessThan(GOOGLE_MAPS_PRICING.placeDetails)
    // Autocomplete is the cheapest
    expect(GOOGLE_MAPS_PRICING.autocomplete).toBeLessThan(GOOGLE_MAPS_PRICING.geocode)
  })
})

describe('IMAGE_SERVICE_PRICING', () => {
  it('should have free pricing for Pixabay and Pexels', () => {
    expect(IMAGE_SERVICE_PRICING.pixabaySearch).toBe(0)
    expect(IMAGE_SERVICE_PRICING.pexelsSearch).toBe(0)
  })

  it('should have pricing for Google Places photos', () => {
    expect(IMAGE_SERVICE_PRICING.googlePlacesPhoto).toBeGreaterThan(0)
  })
})

describe('DEFAULT_AI_MODELS', () => {
  it('should have defaults for all providers', () => {
    expect(DEFAULT_AI_MODELS.google).toBeDefined()
    expect(DEFAULT_AI_MODELS.anthropic).toBeDefined()
    expect(DEFAULT_AI_MODELS.openai).toBeDefined()
    expect(DEFAULT_AI_MODELS.openrouter).toBeDefined()
  })

  it('default models should exist in pricing', () => {
    expect(AI_MODEL_PRICING[DEFAULT_AI_MODELS.google]).toBeDefined()
    expect(AI_MODEL_PRICING[DEFAULT_AI_MODELS.anthropic]).toBeDefined()
    expect(AI_MODEL_PRICING[DEFAULT_AI_MODELS.openai]).toBeDefined()
    // OpenRouter uses provider/model format, so skip direct lookup
  })
})

describe('DEFAULT_EMBEDDING_MODELS', () => {
  it('should have defaults for all providers', () => {
    expect(DEFAULT_EMBEDDING_MODELS.openai).toBeDefined()
    expect(DEFAULT_EMBEDDING_MODELS.google).toBeDefined()
  })
})

describe('DEFAULT_GEOCODING_PROVIDER', () => {
  it('should be google_places', () => {
    expect(DEFAULT_GEOCODING_PROVIDER).toBe('google_places')
  })
})

describe('getAIModelPricing', () => {
  it('should return pricing for known models', () => {
    const pricing = getAIModelPricing('gpt-5-mini')
    expect(pricing).not.toBeNull()
    expect(pricing?.inputTokenPrice).toBeGreaterThan(0)
    expect(pricing?.outputTokenPrice).toBeGreaterThan(0)
  })

  it('should return null for unknown models', () => {
    expect(getAIModelPricing('unknown-model')).toBeNull()
  })
})

describe('getEmbeddingModelPricing', () => {
  it('should return pricing for known models', () => {
    const pricing = getEmbeddingModelPricing('text-embedding-3-small')
    expect(pricing).not.toBeNull()
    expect(pricing?.inputTokenPrice).toBeGreaterThan(0)
  })

  it('should return null for unknown models', () => {
    expect(getEmbeddingModelPricing('unknown-model')).toBeNull()
  })
})

describe('getDefaultAIModel', () => {
  it('should return default models for each provider', () => {
    expect(getDefaultAIModel('google')).toBe(DEFAULT_AI_MODELS.google)
    expect(getDefaultAIModel('anthropic')).toBe(DEFAULT_AI_MODELS.anthropic)
    expect(getDefaultAIModel('openai')).toBe(DEFAULT_AI_MODELS.openai)
    expect(getDefaultAIModel('openrouter')).toBe(DEFAULT_AI_MODELS.openrouter)
  })
})

describe('getDefaultEmbeddingModel', () => {
  it('should return default models for each provider', () => {
    expect(getDefaultEmbeddingModel('openai')).toBe(DEFAULT_EMBEDDING_MODELS.openai)
    expect(getDefaultEmbeddingModel('google')).toBe(DEFAULT_EMBEDDING_MODELS.google)
  })
})

describe('listAIModels', () => {
  it('should return all AI model keys', () => {
    const models = listAIModels()
    expect(models).toContain('gpt-5-mini')
    expect(models).toContain('claude-haiku-4-5')
    expect(models).toContain('gemini-3-flash-preview')
    expect(models.length).toBe(Object.keys(AI_MODEL_PRICING).length)
  })
})

describe('listEmbeddingModels', () => {
  it('should return all embedding model keys', () => {
    const models = listEmbeddingModels()
    expect(models).toContain('text-embedding-3-small')
    expect(models).toContain('text-embedding-3-large')
    expect(models.length).toBe(Object.keys(EMBEDDING_MODEL_PRICING).length)
  })
})
