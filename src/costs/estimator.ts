/**
 * Cost Estimator
 *
 * Functions for estimating costs before processing.
 * Used to give users price quotes and set spending limits.
 */

import {
  calculateAIInputCost,
  calculateAIOutputCost,
  calculateEmbeddingCost,
  calculatePlacesLookupCost,
  calculatePlacesPhotoCost,
  microsToCents
} from './calculator'
import { DEFAULT_AI_MODELS, DEFAULT_EMBEDDING_MODELS } from './pricing'
import type {
  AIProvider,
  CostEstimate,
  CostEstimateInput,
  EmbeddingProvider,
  MicroDollars
} from './types'

// =============================================================================
// ESTIMATION CONSTANTS
// =============================================================================

/**
 * Default assumptions for cost estimation.
 * These are based on analysis of real chat data.
 */
export const ESTIMATION_DEFAULTS = {
  /** Average tokens per chat message */
  avgTokensPerMessage: 80,
  /** Ratio of activities found to messages processed */
  activitiesPerMessage: 1 / 150, // 1 activity per 150 messages
  /** Messages per classification batch */
  classificationBatchSize: 50,
  /** Average output tokens per classified activity */
  outputTokensPerActivity: 150,
  /** Percentage of activities that are geocodable */
  geocodableRatio: 0.7,
  /** Low estimate multiplier (80% confidence) */
  lowMultiplier: 0.6,
  /** High estimate multiplier (80% confidence) */
  highMultiplier: 1.8
} as const

// =============================================================================
// TOKEN ESTIMATION
// =============================================================================

/**
 * Estimate token count for a text string.
 * Uses a simple character-based heuristic.
 *
 * Rough rule: ~4 characters per token for English text.
 */
export function estimateTokenCount(text: string): number {
  // Simple heuristic: ~4 chars per token
  return Math.ceil(text.length / 4)
}

/**
 * Estimate tokens for a batch of messages.
 */
export function estimateMessageTokens(messageCount: number, avgTokensPerMessage?: number): number {
  const tokensPerMessage = avgTokensPerMessage ?? ESTIMATION_DEFAULTS.avgTokensPerMessage
  return messageCount * tokensPerMessage
}

// =============================================================================
// ACTIVITY ESTIMATION
// =============================================================================

/**
 * Estimate number of activities that will be found.
 */
export function estimateActivityCount(messageCount: number): number {
  return Math.ceil(messageCount * ESTIMATION_DEFAULTS.activitiesPerMessage)
}

/**
 * Estimate number of geocodable activities.
 */
export function estimateGeocodableCount(activityCount: number): number {
  return Math.ceil(activityCount * ESTIMATION_DEFAULTS.geocodableRatio)
}

// =============================================================================
// FULL COST ESTIMATION
// =============================================================================

/**
 * Estimate the full cost of processing a chat.
 *
 * @param input - Estimation input parameters
 * @param aiProvider - AI provider to use (default: 'google')
 * @param embeddingProvider - Embedding provider to use (default: 'openai')
 * @returns Cost estimate with breakdown
 */
export function estimateProcessingCost(
  input: CostEstimateInput,
  aiProvider: AIProvider = 'google',
  embeddingProvider: EmbeddingProvider = 'openai'
): CostEstimate {
  const {
    messageCount,
    avgTokensPerMessage = ESTIMATION_DEFAULTS.avgTokensPerMessage,
    estimatedActivities,
    includeImages = false
  } = input

  // Get models
  const aiModel = input.aiModel ?? DEFAULT_AI_MODELS[aiProvider]
  const embeddingModel = input.embeddingModel ?? DEFAULT_EMBEDDING_MODELS[embeddingProvider]

  // Estimate tokens
  const totalInputTokens = messageCount * avgTokensPerMessage

  // Estimate activities
  const activityCount = estimatedActivities ?? estimateActivityCount(messageCount)
  const geocodableCount = estimateGeocodableCount(activityCount)

  // 1. Embedding cost
  const embeddingCostMicros = calculateEmbeddingCost(embeddingModel, totalInputTokens)

  // 2. Classification cost
  // We batch messages, but each batch produces output for found activities
  const classificationInputTokens = totalInputTokens // Input is all messages
  const classificationOutputTokens = activityCount * ESTIMATION_DEFAULTS.outputTokensPerActivity
  const classificationCostMicros =
    calculateAIInputCost(aiModel, classificationInputTokens) +
    calculateAIOutputCost(aiModel, classificationOutputTokens)

  // 3. Geocoding cost
  const geocodingCostMicros = calculatePlacesLookupCost(geocodableCount)

  // 4. Image cost (optional)
  let imageCostMicros: MicroDollars = 0
  if (includeImages) {
    // Assume 1 image per geocodable activity from Google Places
    imageCostMicros = calculatePlacesPhotoCost(geocodableCount)
  }

  // Total
  const totalCostMicros =
    embeddingCostMicros + classificationCostMicros + geocodingCostMicros + imageCostMicros
  const totalCostCents = microsToCents(totalCostMicros)

  // Confidence range
  const lowEstimateCents = Math.floor(totalCostCents * ESTIMATION_DEFAULTS.lowMultiplier)
  const highEstimateCents = Math.ceil(totalCostCents * ESTIMATION_DEFAULTS.highMultiplier)

  return {
    estimatedCostMicros: totalCostMicros,
    estimatedCostCents: totalCostCents,
    lowEstimateCents,
    highEstimateCents,
    breakdown: {
      embedding: {
        tokens: totalInputTokens,
        costMicros: embeddingCostMicros
      },
      classification: {
        inputTokens: classificationInputTokens,
        outputTokens: classificationOutputTokens,
        costMicros: classificationCostMicros
      },
      geocoding: {
        requests: geocodableCount,
        costMicros: geocodingCostMicros
      },
      ...(includeImages && {
        images: {
          requests: geocodableCount,
          costMicros: imageCostMicros
        }
      })
    },
    assumptions: {
      avgTokensPerMessage,
      activitiesPerMessage: ESTIMATION_DEFAULTS.activitiesPerMessage,
      classificationBatchSize: ESTIMATION_DEFAULTS.classificationBatchSize,
      outputTokensPerActivity: ESTIMATION_DEFAULTS.outputTokensPerActivity
    }
  }
}

/**
 * Quick estimate for display (just returns cents).
 * Simpler version for UI price display.
 */
export function quickEstimateCents(
  messageCount: number,
  aiProvider: AIProvider = 'google'
): number {
  const estimate = estimateProcessingCost({ messageCount }, aiProvider)
  return estimate.estimatedCostCents
}

/**
 * Format an estimate for display.
 */
export function formatEstimate(estimate: CostEstimate): string {
  const low = (estimate.lowEstimateCents / 100).toFixed(2)
  const high = (estimate.highEstimateCents / 100).toFixed(2)
  return `$${low} - $${high}`
}

/**
 * Format estimate with breakdown.
 */
export function formatEstimateDetailed(estimate: CostEstimate): string {
  const lines = [
    `Estimated cost: $${(estimate.estimatedCostCents / 100).toFixed(2)}`,
    `Range: $${(estimate.lowEstimateCents / 100).toFixed(2)} - $${(estimate.highEstimateCents / 100).toFixed(2)}`,
    '',
    'Breakdown:',
    `  Embeddings: ${estimate.breakdown.embedding.tokens.toLocaleString()} tokens`,
    `  Classification: ${estimate.breakdown.classification.inputTokens.toLocaleString()} in / ${estimate.breakdown.classification.outputTokens.toLocaleString()} out`,
    `  Geocoding: ${estimate.breakdown.geocoding.requests.toLocaleString()} requests`
  ]

  if (estimate.breakdown.images) {
    lines.push(`  Images: ${estimate.breakdown.images.requests.toLocaleString()} requests`)
  }

  lines.push('')
  lines.push('Assumptions:')
  lines.push(`  ~${estimate.assumptions.avgTokensPerMessage} tokens/message`)
  lines.push(
    `  ~1 activity per ${Math.round(1 / estimate.assumptions.activitiesPerMessage)} messages`
  )

  return lines.join('\n')
}
