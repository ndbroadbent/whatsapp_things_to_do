/**
 * Cost Tracking Types
 *
 * Type definitions for the centralized cost tracking system.
 * Used by both CLI users and the SaaS platform.
 */

// =============================================================================
// PROVIDER & SERVICE TYPES
// =============================================================================

/** AI providers for text/classification */
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'openrouter'

/** Embedding providers */
export type EmbeddingProvider = 'openai' | 'google'

/** Geocoding providers */
export type GeocodingProvider = 'google_places' | 'google_geocoding'

/** Image providers */
export type ImageProvider = 'google_places_photos' | 'pixabay' | 'pexels'

/** All provider types */
export type Provider = AIProvider | EmbeddingProvider | GeocodingProvider | ImageProvider

// =============================================================================
// RESOURCE TYPES
// =============================================================================

/** Resources that can be metered */
export type MeteredResource =
  // AI tokens
  | 'ai_input_token'
  | 'ai_output_token'
  | 'embedding_token'
  // API calls
  | 'google_places_lookup'
  | 'google_geocoding_lookup'
  | 'google_places_photo'
  | 'pixabay_search'
  | 'pexels_search'
  // Compute
  | 'compute_second'

// =============================================================================
// PRICING TYPES
// =============================================================================

/**
 * Price per unit in micro-dollars (1/1,000,000 of a dollar).
 * Using micro-dollars allows precise fractional token pricing.
 *
 * Example: $0.00015 per token = 150 micro-dollars
 */
export type MicroDollars = number

/**
 * Pricing for a specific model/service.
 * All prices in micro-dollars per unit.
 */
export interface ModelPricing {
  /** Model or service identifier */
  model: string
  /** Provider */
  provider: Provider
  /** Input token price (micro-dollars per token) */
  inputTokenPrice?: MicroDollars
  /** Output token price (micro-dollars per token) */
  outputTokenPrice?: MicroDollars
  /** Per-request price (micro-dollars per request) */
  requestPrice?: MicroDollars
  /** Context window size (for estimation) */
  contextWindow?: number
  /** Last updated date */
  updatedAt: string
}

// =============================================================================
// USAGE TRACKING TYPES
// =============================================================================

/**
 * Usage record for a single API call.
 */
export interface UsageRecord {
  /** Resource type */
  resource: MeteredResource
  /** Provider used */
  provider: Provider
  /** Model used (if applicable) */
  model?: string
  /** Quantity consumed */
  quantity: number
  /** Cost in micro-dollars */
  costMicros: MicroDollars
  /** Timestamp */
  timestamp: Date
  /** Optional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Aggregated usage for a session/job.
 */
export interface UsageSummary {
  /** Total cost in micro-dollars */
  totalCostMicros: MicroDollars
  /** Total cost in cents (for display) */
  totalCostCents: number
  /** Breakdown by resource type */
  byResource: Record<MeteredResource, { quantity: number; costMicros: MicroDollars }>
  /** Breakdown by provider */
  byProvider: Record<Provider, { quantity: number; costMicros: MicroDollars }>
  /** Individual usage records */
  records: UsageRecord[]
}

// =============================================================================
// ESTIMATION TYPES
// =============================================================================

/**
 * Input for cost estimation before processing.
 */
export interface CostEstimateInput {
  /** Number of messages to process */
  messageCount: number
  /** Average tokens per message (default: 100) */
  avgTokensPerMessage?: number
  /** Estimated activities to geocode */
  estimatedActivities?: number
  /** Whether to include image fetching */
  includeImages?: boolean
  /** AI model to use */
  aiModel?: string
  /** Embedding model to use */
  embeddingModel?: string
}

/**
 * Cost estimate result.
 */
export interface CostEstimate {
  /** Estimated cost in micro-dollars */
  estimatedCostMicros: MicroDollars
  /** Estimated cost in cents */
  estimatedCostCents: number
  /** Low estimate (80% confidence) */
  lowEstimateCents: number
  /** High estimate (80% confidence) */
  highEstimateCents: number
  /** Breakdown by stage */
  breakdown: {
    embedding: { tokens: number; costMicros: MicroDollars }
    classification: { inputTokens: number; outputTokens: number; costMicros: MicroDollars }
    geocoding: { requests: number; costMicros: MicroDollars }
    images?: { requests: number; costMicros: MicroDollars }
  }
  /** Assumptions used */
  assumptions: {
    avgTokensPerMessage: number
    activitiesPerMessage: number
    classificationBatchSize: number
    outputTokensPerActivity: number
  }
}
