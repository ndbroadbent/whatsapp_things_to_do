/**
 * Cost Calculator
 *
 * Functions for calculating costs of API operations.
 * All costs are calculated in micro-dollars for precision.
 */

import {
  GOOGLE_MAPS_PRICING,
  getAIModelPricing,
  getEmbeddingModelPricing,
  IMAGE_SERVICE_PRICING
} from './pricing'
import type { MeteredResource, MicroDollars, Provider, UsageRecord } from './types'

// =============================================================================
// CONVERSION UTILITIES
// =============================================================================

/**
 * Convert micro-dollars to cents.
 * 1 cent = 10,000 micro-dollars
 */
export function microsToCents(micros: MicroDollars): number {
  return Math.ceil(micros / 10_000)
}

/**
 * Convert cents to micro-dollars.
 */
export function centsToMicros(cents: number): MicroDollars {
  return cents * 10_000
}

/**
 * Convert micro-dollars to dollars.
 */
export function microsToDollars(micros: MicroDollars): number {
  return micros / 1_000_000
}

/**
 * Format micro-dollars as a dollar string.
 */
export function formatMicrosAsDollars(micros: MicroDollars): string {
  const dollars = microsToDollars(micros)
  if (dollars < 0.01) {
    return `$${dollars.toFixed(4)}`
  }
  return `$${dollars.toFixed(2)}`
}

// =============================================================================
// AI COST CALCULATIONS
// =============================================================================

/**
 * Calculate cost for AI model input tokens.
 */
export function calculateAIInputCost(model: string, tokenCount: number): MicroDollars {
  const pricing = getAIModelPricing(model)
  if (!pricing?.inputTokenPrice) {
    throw new Error(`Unknown AI model or no input pricing: ${model}`)
  }
  return pricing.inputTokenPrice * tokenCount
}

/**
 * Calculate cost for AI model output tokens.
 */
export function calculateAIOutputCost(model: string, tokenCount: number): MicroDollars {
  const pricing = getAIModelPricing(model)
  if (!pricing?.outputTokenPrice) {
    throw new Error(`Unknown AI model or no output pricing: ${model}`)
  }
  return pricing.outputTokenPrice * tokenCount
}

/**
 * Calculate total cost for an AI completion.
 */
export function calculateAICompletionCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): MicroDollars {
  return calculateAIInputCost(model, inputTokens) + calculateAIOutputCost(model, outputTokens)
}

/**
 * Create a usage record for an AI completion.
 */
export function createAIUsageRecords(
  model: string,
  inputTokens: number,
  outputTokens: number,
  metadata?: Record<string, unknown>
): UsageRecord[] {
  const pricing = getAIModelPricing(model)
  if (!pricing) {
    throw new Error(`Unknown AI model: ${model}`)
  }

  const records: UsageRecord[] = []
  const now = new Date()

  if (inputTokens > 0) {
    const record: UsageRecord = {
      resource: 'ai_input_token',
      provider: pricing.provider,
      model,
      quantity: inputTokens,
      costMicros: calculateAIInputCost(model, inputTokens),
      timestamp: now
    }
    if (metadata) record.metadata = metadata
    records.push(record)
  }

  if (outputTokens > 0) {
    const record: UsageRecord = {
      resource: 'ai_output_token',
      provider: pricing.provider,
      model,
      quantity: outputTokens,
      costMicros: calculateAIOutputCost(model, outputTokens),
      timestamp: now
    }
    if (metadata) record.metadata = metadata
    records.push(record)
  }

  return records
}

// =============================================================================
// EMBEDDING COST CALCULATIONS
// =============================================================================

/**
 * Calculate cost for embedding tokens.
 */
export function calculateEmbeddingCost(model: string, tokenCount: number): MicroDollars {
  const pricing = getEmbeddingModelPricing(model)
  if (!pricing?.inputTokenPrice) {
    throw new Error(`Unknown embedding model or no pricing: ${model}`)
  }
  return pricing.inputTokenPrice * tokenCount
}

/**
 * Create a usage record for embeddings.
 */
export function createEmbeddingUsageRecord(
  model: string,
  tokenCount: number,
  metadata?: Record<string, unknown>
): UsageRecord {
  const pricing = getEmbeddingModelPricing(model)
  if (!pricing) {
    throw new Error(`Unknown embedding model: ${model}`)
  }

  const record: UsageRecord = {
    resource: 'embedding_token',
    provider: pricing.provider as Provider,
    model,
    quantity: tokenCount,
    costMicros: calculateEmbeddingCost(model, tokenCount),
    timestamp: new Date()
  }
  if (metadata) record.metadata = metadata
  return record
}

// =============================================================================
// GEOCODING COST CALCULATIONS
// =============================================================================

/**
 * Calculate cost for Google Places lookup.
 */
export function calculatePlacesLookupCost(requestCount: number): MicroDollars {
  return GOOGLE_MAPS_PRICING.placeDetails * requestCount
}

/**
 * Calculate cost for Google Geocoding.
 */
export function calculateGeocodingCost(requestCount: number): MicroDollars {
  return GOOGLE_MAPS_PRICING.geocode * requestCount
}

/**
 * Create a usage record for geocoding.
 */
export function createGeocodingUsageRecord(
  type: 'places' | 'geocoding',
  requestCount: number,
  metadata?: Record<string, unknown>
): UsageRecord {
  const resource: MeteredResource =
    type === 'places' ? 'google_places_lookup' : 'google_geocoding_lookup'
  const costMicros =
    type === 'places'
      ? calculatePlacesLookupCost(requestCount)
      : calculateGeocodingCost(requestCount)

  const record: UsageRecord = {
    resource,
    provider: type === 'places' ? 'google_places' : 'google_geocoding',
    quantity: requestCount,
    costMicros,
    timestamp: new Date()
  }
  if (metadata) record.metadata = metadata
  return record
}

// =============================================================================
// IMAGE COST CALCULATIONS
// =============================================================================

/**
 * Calculate cost for Google Places photo.
 */
export function calculatePlacesPhotoCost(requestCount: number): MicroDollars {
  return GOOGLE_MAPS_PRICING.placePhoto * requestCount
}

/**
 * Calculate cost for Pixabay search (free).
 */
export function calculatePixabayCost(_requestCount: number): MicroDollars {
  return IMAGE_SERVICE_PRICING.pixabaySearch
}

/**
 * Calculate cost for Pexels search (free).
 */
export function calculatePexelsCost(_requestCount: number): MicroDollars {
  return IMAGE_SERVICE_PRICING.pexelsSearch
}

/**
 * Create a usage record for image fetching.
 */
export function createImageUsageRecord(
  provider: 'google_places' | 'pixabay' | 'pexels',
  requestCount: number,
  metadata?: Record<string, unknown>
): UsageRecord {
  let resource: MeteredResource
  let costMicros: MicroDollars

  switch (provider) {
    case 'google_places':
      resource = 'google_places_photo'
      costMicros = calculatePlacesPhotoCost(requestCount)
      break
    case 'pixabay':
      resource = 'pixabay_search'
      costMicros = calculatePixabayCost(requestCount)
      break
    case 'pexels':
      resource = 'pexels_search'
      costMicros = calculatePexelsCost(requestCount)
      break
  }

  const record: UsageRecord = {
    resource,
    provider,
    quantity: requestCount,
    costMicros,
    timestamp: new Date()
  }
  if (metadata) record.metadata = metadata
  return record
}

// =============================================================================
// AGGREGATE CALCULATIONS
// =============================================================================

/**
 * Sum costs from multiple usage records.
 */
export function sumUsageCosts(records: UsageRecord[]): MicroDollars {
  return records.reduce((sum, record) => sum + record.costMicros, 0)
}

/**
 * Group usage records by resource type.
 */
export function groupByResource(
  records: UsageRecord[]
): Record<MeteredResource, { quantity: number; costMicros: MicroDollars }> {
  const result: Partial<Record<MeteredResource, { quantity: number; costMicros: MicroDollars }>> =
    {}

  for (const record of records) {
    const existing = result[record.resource]
    if (existing) {
      existing.quantity += record.quantity
      existing.costMicros += record.costMicros
    } else {
      result[record.resource] = {
        quantity: record.quantity,
        costMicros: record.costMicros
      }
    }
  }

  return result as Record<MeteredResource, { quantity: number; costMicros: MicroDollars }>
}

/**
 * Group usage records by provider.
 */
export function groupByProvider(
  records: UsageRecord[]
): Record<Provider, { quantity: number; costMicros: MicroDollars }> {
  const result: Partial<Record<Provider, { quantity: number; costMicros: MicroDollars }>> = {}

  for (const record of records) {
    const existing = result[record.provider]
    if (existing) {
      existing.quantity += record.quantity
      existing.costMicros += record.costMicros
    } else {
      result[record.provider] = {
        quantity: record.quantity,
        costMicros: record.costMicros
      }
    }
  }

  return result as Record<Provider, { quantity: number; costMicros: MicroDollars }>
}
