/**
 * Tests for CostTracker class
 */

import { describe, expect, it } from 'vitest'
import {
  createAIUsageRecords,
  createEmbeddingUsageRecord,
  createGeocodingUsageRecord
} from './calculator'
import { CostTracker, createCostTracker } from './tracker'
import type { UsageRecord } from './types'

describe('CostTracker', () => {
  describe('constructor', () => {
    it('should create an empty tracker', () => {
      const tracker = new CostTracker()
      expect(tracker.recordCount).toBe(0)
      expect(tracker.hasRecords).toBe(false)
    })
  })

  describe('addRecord', () => {
    it('should add a single record', () => {
      const tracker = new CostTracker()
      const record: UsageRecord = {
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 150,
        timestamp: new Date()
      }

      tracker.addRecord(record)

      expect(tracker.recordCount).toBe(1)
      expect(tracker.hasRecords).toBe(true)
    })

    it('should add multiple records sequentially', () => {
      const tracker = new CostTracker()

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 150,
        timestamp: new Date()
      })

      tracker.addRecord({
        resource: 'ai_output_token',
        provider: 'openai',
        quantity: 500,
        costMicros: 300,
        timestamp: new Date()
      })

      expect(tracker.recordCount).toBe(2)
    })
  })

  describe('addRecords', () => {
    it('should add multiple records at once', () => {
      const tracker = new CostTracker()
      const records = createAIUsageRecords('gpt-5-mini', 1000, 500)

      tracker.addRecords(records)

      expect(tracker.recordCount).toBe(2)
    })

    it('should append to existing records', () => {
      const tracker = new CostTracker()

      tracker.addRecord({
        resource: 'embedding_token',
        provider: 'openai',
        quantity: 5000,
        costMicros: 100,
        timestamp: new Date()
      })

      const aiRecords = createAIUsageRecords('gpt-5-mini', 1000, 500)
      tracker.addRecords(aiRecords)

      expect(tracker.recordCount).toBe(3)
    })
  })

  describe('getRecords', () => {
    it('should return all records', () => {
      const tracker = new CostTracker()
      const records = createAIUsageRecords('gpt-5-mini', 1000, 500)
      tracker.addRecords(records)

      const retrieved = tracker.getRecords()

      expect(retrieved).toHaveLength(2)
      expect(retrieved[0]?.resource).toBe('ai_input_token')
      expect(retrieved[1]?.resource).toBe('ai_output_token')
    })

    it('should return readonly array', () => {
      const tracker = new CostTracker()
      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 100, 50))

      const records = tracker.getRecords()

      // TypeScript should prevent modification, but verify runtime behavior
      expect(Array.isArray(records)).toBe(true)
    })
  })

  describe('getTotalCostMicros', () => {
    it('should return 0 for empty tracker', () => {
      const tracker = new CostTracker()
      expect(tracker.getTotalCostMicros()).toBe(0)
    })

    it('should sum all record costs', () => {
      const tracker = new CostTracker()

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 150,
        timestamp: new Date()
      })

      tracker.addRecord({
        resource: 'ai_output_token',
        provider: 'openai',
        quantity: 500,
        costMicros: 300,
        timestamp: new Date()
      })

      tracker.addRecord({
        resource: 'google_places_lookup',
        provider: 'google_places',
        quantity: 5,
        costMicros: 85_000,
        timestamp: new Date()
      })

      expect(tracker.getTotalCostMicros()).toBe(85_450)
    })
  })

  describe('getTotalCostCents', () => {
    it('should return 0 for empty tracker', () => {
      const tracker = new CostTracker()
      expect(tracker.getTotalCostCents()).toBe(0)
    })

    it('should convert micros to cents', () => {
      const tracker = new CostTracker()

      tracker.addRecord({
        resource: 'google_places_lookup',
        provider: 'google_places',
        quantity: 10,
        costMicros: 170_000, // 17 cents
        timestamp: new Date()
      })

      expect(tracker.getTotalCostCents()).toBe(17)
    })

    it('should round up fractional cents', () => {
      const tracker = new CostTracker()

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 100,
        costMicros: 15, // 0.0015 cents, rounds up to 1
        timestamp: new Date()
      })

      expect(tracker.getTotalCostCents()).toBe(1)
    })
  })

  describe('getSummary', () => {
    it('should return complete summary', () => {
      const tracker = new CostTracker()

      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 1000, 500))
      tracker.addRecord(createEmbeddingUsageRecord('text-embedding-3-small', 5000))
      tracker.addRecord(createGeocodingUsageRecord('places', 5))

      const summary = tracker.getSummary()

      expect(summary.totalCostMicros).toBeGreaterThan(0)
      expect(summary.totalCostCents).toBeGreaterThan(0)
      expect(summary.byResource).toBeDefined()
      expect(summary.byProvider).toBeDefined()
      expect(summary.records).toHaveLength(4)
    })

    it('should group by resource', () => {
      const tracker = new CostTracker()

      // Add two input token records from different providers
      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 150,
        timestamp: new Date()
      })

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'anthropic',
        quantity: 500,
        costMicros: 75,
        timestamp: new Date()
      })

      const summary = tracker.getSummary()

      expect(summary.byResource.ai_input_token).toEqual({
        quantity: 1500,
        costMicros: 225
      })
    })

    it('should group by provider', () => {
      const tracker = new CostTracker()

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 150,
        timestamp: new Date()
      })

      tracker.addRecord({
        resource: 'embedding_token',
        provider: 'openai',
        quantity: 5000,
        costMicros: 100,
        timestamp: new Date()
      })

      const summary = tracker.getSummary()

      expect(summary.byProvider.openai).toEqual({
        quantity: 6000,
        costMicros: 250
      })
    })

    it('should return copy of records', () => {
      const tracker = new CostTracker()
      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 100, 50))

      const summary = tracker.getSummary()

      // Modifying returned records shouldn't affect tracker
      summary.records.pop()
      expect(tracker.recordCount).toBe(2)
    })
  })

  describe('clear', () => {
    it('should remove all records', () => {
      const tracker = new CostTracker()
      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 1000, 500))

      expect(tracker.recordCount).toBe(2)

      tracker.clear()

      expect(tracker.recordCount).toBe(0)
      expect(tracker.hasRecords).toBe(false)
      expect(tracker.getTotalCostMicros()).toBe(0)
    })
  })

  describe('recordCount', () => {
    it('should return count of records', () => {
      const tracker = new CostTracker()

      expect(tracker.recordCount).toBe(0)

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 100,
        costMicros: 15,
        timestamp: new Date()
      })

      expect(tracker.recordCount).toBe(1)

      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 100, 50))

      expect(tracker.recordCount).toBe(3)
    })
  })

  describe('hasRecords', () => {
    it('should return false for empty tracker', () => {
      const tracker = new CostTracker()
      expect(tracker.hasRecords).toBe(false)
    })

    it('should return true when records exist', () => {
      const tracker = new CostTracker()
      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 100,
        costMicros: 15,
        timestamp: new Date()
      })
      expect(tracker.hasRecords).toBe(true)
    })

    it('should return false after clear', () => {
      const tracker = new CostTracker()
      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 100,
        costMicros: 15,
        timestamp: new Date()
      })
      tracker.clear()
      expect(tracker.hasRecords).toBe(false)
    })
  })

  describe('formatSummary', () => {
    it('should return message for empty tracker', () => {
      const tracker = new CostTracker()
      expect(tracker.formatSummary()).toBe('No usage recorded')
    })

    it('should format summary with totals', () => {
      const tracker = new CostTracker()
      tracker.addRecord({
        resource: 'google_places_lookup',
        provider: 'google_places',
        quantity: 10,
        costMicros: 170_000, // $0.17
        timestamp: new Date()
      })

      const formatted = tracker.formatSummary()

      expect(formatted).toContain('Total: $0.17')
      expect(formatted).toContain('By resource:')
      expect(formatted).toContain('google_places_lookup')
    })

    it('should show all resources', () => {
      const tracker = new CostTracker()

      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 1000, 500))
      tracker.addRecord(createEmbeddingUsageRecord('text-embedding-3-small', 5000))
      tracker.addRecord(createGeocodingUsageRecord('places', 5))

      const formatted = tracker.formatSummary()

      expect(formatted).toContain('ai_input_token')
      expect(formatted).toContain('ai_output_token')
      expect(formatted).toContain('embedding_token')
      expect(formatted).toContain('google_places_lookup')
    })
  })

  describe('toJSON', () => {
    it('should return serializable object', () => {
      const tracker = new CostTracker()
      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 1000, 500))

      const json = tracker.toJSON()

      expect(json.totalCostMicros).toBe(tracker.getTotalCostMicros())
      expect(json.totalCostCents).toBe(tracker.getTotalCostCents())
      expect(json.records).toHaveLength(2)
    })

    it('should convert timestamps to ISO strings', () => {
      const tracker = new CostTracker()
      const timestamp = new Date('2025-01-01T12:00:00Z')

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 100,
        costMicros: 15,
        timestamp
      })

      const json = tracker.toJSON()

      expect(json.records[0]?.timestamp).toBe('2025-01-01T12:00:00.000Z')
    })

    it('should be JSON.stringify compatible', () => {
      const tracker = new CostTracker()
      tracker.addRecords(createAIUsageRecords('gpt-5-mini', 1000, 500))

      const jsonString = JSON.stringify(tracker.toJSON())
      const parsed = JSON.parse(jsonString)

      expect(parsed.totalCostMicros).toBe(tracker.getTotalCostMicros())
      expect(parsed.records).toHaveLength(2)
    })
  })

  describe('fromJSON', () => {
    it('should restore tracker from JSON', () => {
      const original = new CostTracker()
      original.addRecords(createAIUsageRecords('gpt-5-mini', 1000, 500))

      const json = original.toJSON()
      // Convert to string and back to simulate real serialization
      const parsed = JSON.parse(JSON.stringify(json))

      const restored = CostTracker.fromJSON(parsed)

      expect(restored.recordCount).toBe(original.recordCount)
      expect(restored.getTotalCostMicros()).toBe(original.getTotalCostMicros())
    })

    it('should restore timestamps as Date objects', () => {
      const tracker = new CostTracker()
      const timestamp = new Date('2025-01-01T12:00:00Z')

      tracker.addRecord({
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 100,
        costMicros: 15,
        timestamp
      })

      const json = JSON.parse(JSON.stringify(tracker.toJSON()))
      const restored = CostTracker.fromJSON(json)

      const records = restored.getRecords()
      expect(records[0]?.timestamp).toBeInstanceOf(Date)
      expect(records[0]?.timestamp.toISOString()).toBe('2025-01-01T12:00:00.000Z')
    })

    it('should handle empty records', () => {
      const restored = CostTracker.fromJSON({ records: [] })

      expect(restored.recordCount).toBe(0)
      expect(restored.hasRecords).toBe(false)
    })
  })
})

describe('createCostTracker', () => {
  it('should create a new CostTracker instance', () => {
    const tracker = createCostTracker()

    expect(tracker).toBeInstanceOf(CostTracker)
    expect(tracker.recordCount).toBe(0)
  })
})
