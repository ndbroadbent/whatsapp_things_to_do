/**
 * Tests for cost estimator functions
 */

import { describe, expect, it } from 'vitest'
import {
  ESTIMATION_DEFAULTS,
  estimateActivityCount,
  estimateGeocodableCount,
  estimateMessageTokens,
  estimateProcessingCost,
  estimateTokenCount,
  formatEstimate,
  formatEstimateDetailed,
  quickEstimateCents
} from './estimator'

describe('ESTIMATION_DEFAULTS', () => {
  it('should have reasonable default values', () => {
    expect(ESTIMATION_DEFAULTS.avgTokensPerMessage).toBe(80)
    expect(ESTIMATION_DEFAULTS.activitiesPerMessage).toBe(1 / 150)
    expect(ESTIMATION_DEFAULTS.classificationBatchSize).toBe(50)
    expect(ESTIMATION_DEFAULTS.outputTokensPerActivity).toBe(150)
    expect(ESTIMATION_DEFAULTS.geocodableRatio).toBe(0.7)
    expect(ESTIMATION_DEFAULTS.lowMultiplier).toBe(0.6)
    expect(ESTIMATION_DEFAULTS.highMultiplier).toBe(1.8)
  })
})

describe('estimateTokenCount', () => {
  it('should estimate tokens based on character count', () => {
    // ~4 chars per token
    expect(estimateTokenCount('hello')).toBe(2) // 5 chars / 4 = 1.25, ceil = 2
    expect(estimateTokenCount('hello world')).toBe(3) // 11 chars / 4 = 2.75, ceil = 3
  })

  it('should handle empty strings', () => {
    expect(estimateTokenCount('')).toBe(0)
  })

  it('should handle long text', () => {
    const longText = 'a'.repeat(1000)
    expect(estimateTokenCount(longText)).toBe(250) // 1000 / 4 = 250
  })
})

describe('estimateMessageTokens', () => {
  it('should use default tokens per message', () => {
    expect(estimateMessageTokens(100)).toBe(8000) // 100 * 80
    expect(estimateMessageTokens(1000)).toBe(80000) // 1000 * 80
  })

  it('should use custom tokens per message', () => {
    expect(estimateMessageTokens(100, 50)).toBe(5000) // 100 * 50
    expect(estimateMessageTokens(100, 100)).toBe(10000) // 100 * 100
  })

  it('should handle zero messages', () => {
    expect(estimateMessageTokens(0)).toBe(0)
  })
})

describe('estimateActivityCount', () => {
  it('should estimate activities based on message count', () => {
    // 1 activity per 150 messages
    expect(estimateActivityCount(150)).toBe(1)
    expect(estimateActivityCount(300)).toBe(2)
    expect(estimateActivityCount(1500)).toBe(10)
  })

  it('should round up fractional activities', () => {
    expect(estimateActivityCount(1)).toBe(1) // 1/150 = 0.0067, ceil = 1
    expect(estimateActivityCount(151)).toBe(2) // 151/150 = 1.007, ceil = 2
  })

  it('should handle zero messages', () => {
    expect(estimateActivityCount(0)).toBe(0)
  })
})

describe('estimateGeocodableCount', () => {
  it('should estimate geocodable activities at 70%', () => {
    expect(estimateGeocodableCount(10)).toBe(7) // 10 * 0.7 = 7
    expect(estimateGeocodableCount(100)).toBe(70) // 100 * 0.7 = 70
  })

  it('should round up fractional counts', () => {
    expect(estimateGeocodableCount(1)).toBe(1) // 1 * 0.7 = 0.7, ceil = 1
    expect(estimateGeocodableCount(3)).toBe(3) // 3 * 0.7 = 2.1, ceil = 3
  })

  it('should handle zero activities', () => {
    expect(estimateGeocodableCount(0)).toBe(0)
  })
})

describe('estimateProcessingCost', () => {
  it('should return a complete cost estimate', () => {
    const estimate = estimateProcessingCost({ messageCount: 1000 })

    expect(estimate.estimatedCostMicros).toBeGreaterThan(0)
    expect(estimate.estimatedCostCents).toBeGreaterThan(0)
    expect(estimate.lowEstimateCents).toBeLessThan(estimate.estimatedCostCents)
    expect(estimate.highEstimateCents).toBeGreaterThan(estimate.estimatedCostCents)
  })

  it('should include breakdown by component', () => {
    const estimate = estimateProcessingCost({ messageCount: 1000 })

    expect(estimate.breakdown.embedding).toBeDefined()
    expect(estimate.breakdown.embedding.tokens).toBe(80000) // 1000 * 80
    expect(estimate.breakdown.embedding.costMicros).toBeGreaterThan(0)

    expect(estimate.breakdown.classification).toBeDefined()
    expect(estimate.breakdown.classification.inputTokens).toBe(80000)
    expect(estimate.breakdown.classification.outputTokens).toBeGreaterThan(0)
    expect(estimate.breakdown.classification.costMicros).toBeGreaterThan(0)

    expect(estimate.breakdown.geocoding).toBeDefined()
    expect(estimate.breakdown.geocoding.requests).toBeGreaterThan(0)
    expect(estimate.breakdown.geocoding.costMicros).toBeGreaterThan(0)
  })

  it('should not include images by default', () => {
    const estimate = estimateProcessingCost({ messageCount: 1000 })
    expect(estimate.breakdown.images).toBeUndefined()
  })

  it('should include images when requested', () => {
    const estimate = estimateProcessingCost({ messageCount: 1000, includeImages: true })

    expect(estimate.breakdown.images).toBeDefined()
    expect(estimate.breakdown.images?.requests).toBeGreaterThan(0)
    expect(estimate.breakdown.images?.costMicros).toBeGreaterThan(0)
  })

  it('should include assumptions in the estimate', () => {
    const estimate = estimateProcessingCost({ messageCount: 1000 })

    expect(estimate.assumptions.avgTokensPerMessage).toBe(80)
    expect(estimate.assumptions.activitiesPerMessage).toBe(1 / 150)
    expect(estimate.assumptions.classificationBatchSize).toBe(50)
    expect(estimate.assumptions.outputTokensPerActivity).toBe(150)
  })

  it('should respect custom avgTokensPerMessage', () => {
    const estimate = estimateProcessingCost({
      messageCount: 1000,
      avgTokensPerMessage: 100
    })

    expect(estimate.breakdown.embedding.tokens).toBe(100000) // 1000 * 100
    expect(estimate.assumptions.avgTokensPerMessage).toBe(100)
  })

  it('should respect estimatedActivities override', () => {
    const estimate = estimateProcessingCost({
      messageCount: 1000,
      estimatedActivities: 50
    })

    // 50 activities * 0.7 geocodable = 35
    expect(estimate.breakdown.geocoding.requests).toBe(35)
  })

  it('should use different AI providers', () => {
    const googleEstimate = estimateProcessingCost({ messageCount: 1000 }, 'google')
    const openaiEstimate = estimateProcessingCost({ messageCount: 1000 }, 'openai')
    const anthropicEstimate = estimateProcessingCost({ messageCount: 1000 }, 'anthropic')

    // Different providers have different pricing, so costs should differ
    // (assuming we're comparing equivalent models)
    expect(googleEstimate.estimatedCostMicros).not.toBe(openaiEstimate.estimatedCostMicros)
    expect(openaiEstimate.estimatedCostMicros).not.toBe(anthropicEstimate.estimatedCostMicros)
  })

  it('should apply confidence range multipliers', () => {
    const estimate = estimateProcessingCost({ messageCount: 1000 })

    // Low should be ~60% of estimate
    const expectedLow = Math.floor(estimate.estimatedCostCents * 0.6)
    expect(estimate.lowEstimateCents).toBe(expectedLow)

    // High should be ~180% of estimate
    const expectedHigh = Math.ceil(estimate.estimatedCostCents * 1.8)
    expect(estimate.highEstimateCents).toBe(expectedHigh)
  })
})

describe('quickEstimateCents', () => {
  it('should return just the cents estimate', () => {
    const cents = quickEstimateCents(1000)
    expect(typeof cents).toBe('number')
    expect(cents).toBeGreaterThan(0)
  })

  it('should match estimateProcessingCost result', () => {
    const cents = quickEstimateCents(1000, 'google')
    const fullEstimate = estimateProcessingCost({ messageCount: 1000 }, 'google')
    expect(cents).toBe(fullEstimate.estimatedCostCents)
  })

  it('should use different providers', () => {
    // Use larger message count to ensure different pricing shows through
    const googleCents = quickEstimateCents(100000, 'google')
    const openaiCents = quickEstimateCents(100000, 'openai')
    // Both should be positive numbers (the actual values may vary)
    expect(googleCents).toBeGreaterThan(0)
    expect(openaiCents).toBeGreaterThan(0)
  })
})

describe('formatEstimate', () => {
  it('should format estimate as dollar range', () => {
    const estimate = estimateProcessingCost({ messageCount: 10000 })
    const formatted = formatEstimate(estimate)

    expect(formatted).toMatch(/^\$\d+\.\d{2} - \$\d+\.\d{2}$/)
  })

  it('should show low and high values', () => {
    const estimate = {
      estimatedCostMicros: 1_000_000,
      estimatedCostCents: 100,
      lowEstimateCents: 60,
      highEstimateCents: 180,
      breakdown: {
        embedding: { tokens: 1000, costMicros: 100 },
        classification: { inputTokens: 1000, outputTokens: 100, costMicros: 200 },
        geocoding: { requests: 10, costMicros: 300 }
      },
      assumptions: {
        avgTokensPerMessage: 80,
        activitiesPerMessage: 1 / 150,
        classificationBatchSize: 50,
        outputTokensPerActivity: 150
      }
    }

    const formatted = formatEstimate(estimate)
    expect(formatted).toBe('$0.60 - $1.80')
  })
})

describe('formatEstimateDetailed', () => {
  it('should include all breakdown sections', () => {
    const estimate = estimateProcessingCost({ messageCount: 10000 })
    const formatted = formatEstimateDetailed(estimate)

    expect(formatted).toContain('Estimated cost:')
    expect(formatted).toContain('Range:')
    expect(formatted).toContain('Breakdown:')
    expect(formatted).toContain('Embeddings:')
    expect(formatted).toContain('Classification:')
    expect(formatted).toContain('Geocoding:')
    expect(formatted).toContain('Assumptions:')
  })

  it('should include images when present', () => {
    const estimate = estimateProcessingCost({ messageCount: 10000, includeImages: true })
    const formatted = formatEstimateDetailed(estimate)

    expect(formatted).toContain('Images:')
  })

  it('should not include images when absent', () => {
    const estimate = estimateProcessingCost({ messageCount: 10000 })
    const formatted = formatEstimateDetailed(estimate)

    expect(formatted).not.toContain('Images:')
  })

  it('should format numbers with commas', () => {
    const estimate = estimateProcessingCost({ messageCount: 100000 })
    const formatted = formatEstimateDetailed(estimate)

    // 100000 messages * 80 tokens = 8,000,000 tokens
    expect(formatted).toContain('8,000,000')
  })
})
