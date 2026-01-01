/**
 * Cost Tracking Module
 *
 * Centralized cost tracking for ChatToMap.
 * Used by both CLI users (to understand their own costs) and SaaS (for billing).
 *
 * @example
 * ```typescript
 * import { CostTracker, estimateProcessingCost, formatEstimate } from 'chat-to-map/costs'
 *
 * // Get a cost estimate before processing
 * const estimate = estimateProcessingCost({ messageCount: 10000 })
 * console.log(formatEstimate(estimate)) // "$0.50 - $1.50"
 *
 * // Track actual costs during processing
 * const tracker = new CostTracker()
 * tracker.addRecords(createAIUsageRecords('gpt-4o-mini', 5000, 1000))
 * tracker.addRecord(createGeocodingUsageRecord('places', 50))
 *
 * console.log(tracker.getTotalCostCents()) // 25
 * ```
 *
 * @module
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Provider types
  AIProvider,
  CostEstimate,
  // Estimation types
  CostEstimateInput,
  EmbeddingProvider,
  GeocodingProvider,
  ImageProvider,
  // Resource types
  MeteredResource,
  // Pricing types
  MicroDollars,
  ModelPricing,
  Provider,
  // Usage types
  UsageRecord,
  UsageSummary
} from './types'

// =============================================================================
// PRICING EXPORTS
// =============================================================================

export {
  // Model pricing data
  AI_MODEL_PRICING,
  // Default models
  DEFAULT_AI_MODELS,
  DEFAULT_EMBEDDING_MODELS,
  DEFAULT_GEOCODING_PROVIDER,
  EMBEDDING_MODEL_PRICING,
  GOOGLE_MAPS_PRICING,
  // Pricing helpers
  getAIModelPricing,
  getDefaultAIModel,
  getDefaultEmbeddingModel,
  getEmbeddingModelPricing,
  IMAGE_SERVICE_PRICING,
  listAIModels,
  listEmbeddingModels
} from './pricing'

// =============================================================================
// CALCULATOR EXPORTS
// =============================================================================

export {
  calculateAICompletionCost,
  // AI costs
  calculateAIInputCost,
  calculateAIOutputCost,
  // Embedding costs
  calculateEmbeddingCost,
  calculateGeocodingCost,
  calculatePexelsCost,
  calculatePixabayCost,
  // Geocoding costs
  calculatePlacesLookupCost,
  // Image costs
  calculatePlacesPhotoCost,
  centsToMicros,
  createAIUsageRecords,
  createEmbeddingUsageRecord,
  createGeocodingUsageRecord,
  createImageUsageRecord,
  formatMicrosAsDollars,
  groupByProvider,
  groupByResource,
  // Conversions
  microsToCents,
  microsToDollars,
  // Aggregation
  sumUsageCosts
} from './calculator'

// =============================================================================
// ESTIMATOR EXPORTS
// =============================================================================

export {
  // Constants
  ESTIMATION_DEFAULTS,
  // Activity estimation
  estimateActivityCount,
  estimateGeocodableCount,
  estimateMessageTokens,
  // Full estimation
  estimateProcessingCost,
  // Token estimation
  estimateTokenCount,
  // Formatting
  formatEstimate,
  formatEstimateDetailed,
  quickEstimateCents
} from './estimator'

// =============================================================================
// TRACKER EXPORTS
// =============================================================================

export { CostTracker, createCostTracker } from './tracker'
