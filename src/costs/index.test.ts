/**
 * Tests for module exports
 *
 * Verifies all exports are properly exposed from the index file.
 */

import { describe, expect, it } from 'vitest'
import * as costs from './index'

describe('costs module exports', () => {
  describe('pricing exports', () => {
    it('should export pricing constants', () => {
      expect(costs.AI_MODEL_PRICING).toBeDefined()
      expect(costs.EMBEDDING_MODEL_PRICING).toBeDefined()
      expect(costs.GOOGLE_MAPS_PRICING).toBeDefined()
      expect(costs.IMAGE_SERVICE_PRICING).toBeDefined()
    })

    it('should export default models', () => {
      expect(costs.DEFAULT_AI_MODELS).toBeDefined()
      expect(costs.DEFAULT_EMBEDDING_MODELS).toBeDefined()
      expect(costs.DEFAULT_GEOCODING_PROVIDER).toBeDefined()
    })

    it('should export pricing helpers', () => {
      expect(typeof costs.getAIModelPricing).toBe('function')
      expect(typeof costs.getEmbeddingModelPricing).toBe('function')
      expect(typeof costs.getDefaultAIModel).toBe('function')
      expect(typeof costs.getDefaultEmbeddingModel).toBe('function')
      expect(typeof costs.listAIModels).toBe('function')
      expect(typeof costs.listEmbeddingModels).toBe('function')
    })
  })

  describe('calculator exports', () => {
    it('should export conversion functions', () => {
      expect(typeof costs.microsToCents).toBe('function')
      expect(typeof costs.centsToMicros).toBe('function')
      expect(typeof costs.microsToDollars).toBe('function')
      expect(typeof costs.formatMicrosAsDollars).toBe('function')
    })

    it('should export AI cost functions', () => {
      expect(typeof costs.calculateAIInputCost).toBe('function')
      expect(typeof costs.calculateAIOutputCost).toBe('function')
      expect(typeof costs.calculateAICompletionCost).toBe('function')
      expect(typeof costs.createAIUsageRecords).toBe('function')
    })

    it('should export embedding cost functions', () => {
      expect(typeof costs.calculateEmbeddingCost).toBe('function')
      expect(typeof costs.createEmbeddingUsageRecord).toBe('function')
    })

    it('should export geocoding cost functions', () => {
      expect(typeof costs.calculatePlacesLookupCost).toBe('function')
      expect(typeof costs.calculateGeocodingCost).toBe('function')
      expect(typeof costs.createGeocodingUsageRecord).toBe('function')
    })

    it('should export image cost functions', () => {
      expect(typeof costs.calculatePlacesPhotoCost).toBe('function')
      expect(typeof costs.calculatePixabayCost).toBe('function')
      expect(typeof costs.calculatePexelsCost).toBe('function')
      expect(typeof costs.createImageUsageRecord).toBe('function')
    })

    it('should export aggregation functions', () => {
      expect(typeof costs.sumUsageCosts).toBe('function')
      expect(typeof costs.groupByResource).toBe('function')
      expect(typeof costs.groupByProvider).toBe('function')
    })
  })

  describe('estimator exports', () => {
    it('should export estimation constants', () => {
      expect(costs.ESTIMATION_DEFAULTS).toBeDefined()
    })

    it('should export token estimation functions', () => {
      expect(typeof costs.estimateTokenCount).toBe('function')
      expect(typeof costs.estimateMessageTokens).toBe('function')
    })

    it('should export activity estimation functions', () => {
      expect(typeof costs.estimateActivityCount).toBe('function')
      expect(typeof costs.estimateGeocodableCount).toBe('function')
    })

    it('should export full estimation functions', () => {
      expect(typeof costs.estimateProcessingCost).toBe('function')
      expect(typeof costs.quickEstimateCents).toBe('function')
    })

    it('should export formatting functions', () => {
      expect(typeof costs.formatEstimate).toBe('function')
      expect(typeof costs.formatEstimateDetailed).toBe('function')
    })
  })

  describe('tracker exports', () => {
    it('should export CostTracker class', () => {
      expect(costs.CostTracker).toBeDefined()
      expect(typeof costs.CostTracker).toBe('function')
    })

    it('should export createCostTracker factory', () => {
      expect(typeof costs.createCostTracker).toBe('function')
    })

    it('should create working tracker instances', () => {
      const tracker = costs.createCostTracker()
      expect(tracker).toBeInstanceOf(costs.CostTracker)
      expect(tracker.recordCount).toBe(0)
    })
  })

  describe('integration', () => {
    it('should work together for a complete workflow', () => {
      // Create a tracker
      const tracker = costs.createCostTracker()

      // Add AI usage
      const aiRecords = costs.createAIUsageRecords('gpt-5-mini', 1000, 500)
      tracker.addRecords(aiRecords)

      // Add embedding usage
      const embeddingRecord = costs.createEmbeddingUsageRecord('text-embedding-3-small', 5000)
      tracker.addRecord(embeddingRecord)

      // Add geocoding usage
      const geocodingRecord = costs.createGeocodingUsageRecord('places', 5)
      tracker.addRecord(geocodingRecord)

      // Get summary
      const summary = tracker.getSummary()
      expect(summary.totalCostMicros).toBeGreaterThan(0)
      expect(summary.totalCostCents).toBeGreaterThan(0)

      // Format output
      const formatted = tracker.formatSummary()
      expect(formatted).toContain('Total:')
    })
  })
})
