/**
 * Tests for semantic clustering
 *
 * The new clustering approach relies on LLM normalization at classification time.
 * The LLM normalizes synonyms (tramping→hike, cycling→bike, film→movie) and extracts
 * structured fields (action, object, venue, city, country).
 *
 * Clustering is now simple exact-match on normalized fields.
 * Only complete entries (isComplete=true) are clustered; incomplete entries stay as singletons.
 */

import { describe, expect, it } from 'vitest'
import type { ActivityCategory, ClassifiedSuggestion } from '../types/classifier.js'
import { clusterSuggestions } from './index.js'

/**
 * Helper to create a ClassifiedSuggestion for testing.
 * Uses the new normalized fields (action, object, venue, city, country).
 */
function createSuggestion(
  activity: string,
  overrides: Partial<ClassifiedSuggestion> = {}
): ClassifiedSuggestion {
  return {
    messageId: Math.floor(Math.random() * 10000),
    isActivity: true,
    activity,
    activityScore: 0.9,
    category: 'other' as ActivityCategory,
    confidence: 0.9,
    originalMessage: `We should ${activity.toLowerCase()}`,
    sender: 'Test User',
    timestamp: new Date(),
    isGeneric: true,
    isComplete: true,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city: null,
    state: null,
    country: null,
    ...overrides
  }
}

describe('clusterSuggestions', () => {
  describe('basic clustering by normalized fields', () => {
    it('should cluster suggestions with identical normalized fields', () => {
      const suggestions = [
        createSuggestion('Go hiking', { action: 'hike', actionOriginal: 'hiking' }),
        createSuggestion('Go tramping', { action: 'hike', actionOriginal: 'tramping' }),
        createSuggestion('Do a hike', { action: 'hike', actionOriginal: 'hike' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.filtered.length).toBe(0)
    })

    it('should keep different activities in separate clusters', () => {
      const suggestions = [
        createSuggestion('Go biking', { action: 'bike' }),
        createSuggestion('Go swimming', { action: 'swim' }),
        createSuggestion('Visit a restaurant', { action: 'eat', object: 'restaurant' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(3)
      expect(result.clusters.every((c) => c.instanceCount === 1)).toBe(true)
    })

    it('should NOT cluster same action with different objects', () => {
      const suggestions = [
        createSuggestion('Watch a movie', { action: 'watch', object: 'movie' }),
        createSuggestion('Watch a show', { action: 'watch', object: 'show' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(2)
    })
  })

  describe('location handling', () => {
    it('should NOT cluster same activity with different cities', () => {
      const suggestions = [
        createSuggestion('Go kayaking', { action: 'kayak' }),
        createSuggestion('Go kayaking in Mexico', { action: 'kayak', country: 'Mexico' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(2)
    })

    it('should cluster same activity with same city', () => {
      const suggestions = [
        createSuggestion('Hike in Queenstown', { action: 'hike', city: 'Queenstown' }),
        createSuggestion('Go hiking in Queenstown', { action: 'hike', city: 'Queenstown' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should NOT cluster different cities for same activity', () => {
      const suggestions = [
        createSuggestion('Hike', { action: 'hike', city: 'Queenstown' }),
        createSuggestion('Hike', { action: 'hike', city: 'Auckland' }),
        createSuggestion('Hike', { action: 'hike', city: 'Wellington' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(3)
    })

    it('should cluster by venue when present', () => {
      const suggestions = [
        createSuggestion('Dinner at Coffee Lab', { action: 'eat', venue: 'Coffee Lab' }),
        createSuggestion('Try Coffee Lab', { action: 'eat', venue: 'Coffee Lab' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })
  })

  describe('complete vs complex handling', () => {
    it('should cluster complete entries by normalized fields', () => {
      const suggestions = [
        createSuggestion('Go hiking', { action: 'hike', isComplete: true }),
        createSuggestion('Go tramping', { action: 'hike', isComplete: true }),
        createSuggestion('Go hiking and kayaking', { action: 'hike', isComplete: false })
      ]

      const result = clusterSuggestions(suggestions)

      // 2 complete entries cluster by action, 1 complex is separate (different title)
      expect(result.clusters.length).toBe(2)
      const clusterCounts = result.clusters.map((c) => c.instanceCount).sort((a, b) => b - a)
      expect(clusterCounts).toEqual([2, 1])
    })

    it('should cluster complex entries by exact title', () => {
      const suggestions = [
        createSuggestion('Trip to Iceland and see aurora', { action: 'travel', isComplete: false }),
        createSuggestion('Trip to Iceland and see aurora', { action: 'travel', isComplete: false }),
        createSuggestion('Different Iceland trip', { action: 'travel', isComplete: false })
      ]

      const result = clusterSuggestions(suggestions)

      // 2 with same title cluster, 1 different title is separate
      expect(result.clusters.length).toBe(2)
      const clusterCounts = result.clusters.map((c) => c.instanceCount).sort((a, b) => b - a)
      expect(clusterCounts).toEqual([2, 1])
    })

    it('should not mix complete and complex entries even with same action', () => {
      const suggestions = [
        createSuggestion('Go hiking', { action: 'hike', isComplete: true }),
        createSuggestion('Go hiking', { action: 'hike', isComplete: false })
      ]

      const result = clusterSuggestions(suggestions)

      // Same title but different completeness = separate clusters
      expect(result.clusters.length).toBe(2)
    })
  })

  describe('filtering', () => {
    it('should filter by minActivityScore', () => {
      const suggestions = [
        createSuggestion('Go biking', { action: 'bike', activityScore: 0.9 }),
        createSuggestion('Take out trash', { action: 'dispose', activityScore: 0.2 })
      ]

      const result = clusterSuggestions(suggestions, { minActivityScore: 0.5 })

      expect(result.clusters.length).toBe(1)
      expect(result.filtered.length).toBe(1)
      expect(result.filtered[0]?.activity).toBe('Take out trash')
    })
  })

  describe('representative selection', () => {
    it('should select highest confidence as representative', () => {
      const suggestions = [
        createSuggestion('Go biking', { action: 'bike', confidence: 0.7 }),
        createSuggestion('Ride a bike', { action: 'bike', confidence: 0.95 }),
        createSuggestion('Go for a bike ride', { action: 'bike', confidence: 0.8 })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters[0]?.representative.activity).toBe('Ride a bike')
    })

    it('should fall back to activityScore when confidence is equal', () => {
      const suggestions = [
        createSuggestion('Go biking', { action: 'bike', confidence: 0.9, activityScore: 0.7 }),
        createSuggestion('Ride a bike', { action: 'bike', confidence: 0.9, activityScore: 0.95 })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters[0]?.representative.activity).toBe('Ride a bike')
    })
  })

  describe('cluster metadata', () => {
    it('should calculate correct date range', () => {
      const earlyDate = new Date('2025-01-01')
      const lateDate = new Date('2025-12-31')

      const suggestions = [
        createSuggestion('Go biking', { action: 'bike', timestamp: new Date('2025-06-15') }),
        createSuggestion('Ride a bike', { action: 'bike', timestamp: earlyDate }),
        createSuggestion('Go for a bike ride', { action: 'bike', timestamp: lateDate })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters[0]?.firstMentioned.getTime()).toBe(earlyDate.getTime())
      expect(result.clusters[0]?.lastMentioned.getTime()).toBe(lateDate.getTime())
    })

    it('should collect all unique senders', () => {
      const suggestions = [
        createSuggestion('Go biking', { action: 'bike', sender: 'Alice' }),
        createSuggestion('Ride a bike', { action: 'bike', sender: 'Bob' }),
        createSuggestion('Go for a bike ride', { action: 'bike', sender: 'Alice' })
      ]

      const result = clusterSuggestions(suggestions)

      const cluster = result.clusters[0]
      expect(cluster?.allSenders).toHaveLength(2)
      expect(cluster?.allSenders).toContain('Alice')
      expect(cluster?.allSenders).toContain('Bob')
    })

    it('should include cluster key', () => {
      const suggestions = [
        createSuggestion('Hike in Queenstown', {
          action: 'hike',
          city: 'Queenstown',
          country: 'New Zealand'
        })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters[0]?.clusterKey).toBe('hike|||queenstown|new zealand')
    })
  })

  describe('sorting', () => {
    it('should sort clusters by instance count descending', () => {
      const suggestions = [
        createSuggestion('Go swimming', { action: 'swim' }),
        createSuggestion('Go biking', { action: 'bike' }),
        createSuggestion('Ride a bike', { action: 'bike' }),
        createSuggestion('Go for a bike ride', { action: 'bike' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.clusters[1]?.instanceCount).toBe(1)
    })

    it('should sort by first mentioned when instance counts are equal', () => {
      const suggestions = [
        createSuggestion('Go swimming', { action: 'swim', timestamp: new Date('2025-06-01') }),
        createSuggestion('Go biking', { action: 'bike', timestamp: new Date('2025-01-01') })
      ]

      const result = clusterSuggestions(suggestions)

      // Earlier date comes first when counts are equal
      expect(result.clusters[0]?.representative.activity).toBe('Go biking')
      expect(result.clusters[1]?.representative.activity).toBe('Go swimming')
    })
  })

  describe('case insensitivity', () => {
    it('should cluster regardless of case in normalized fields', () => {
      const suggestions = [
        createSuggestion('Go hiking', { action: 'hike', city: 'Queenstown' }),
        createSuggestion('Go tramping', { action: 'Hike', city: 'QUEENSTOWN' }),
        createSuggestion('Do a hike', { action: 'HIKE', city: 'queenstown' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })
  })

  describe('real-world examples', () => {
    it('should cluster normalized movie synonyms', () => {
      // LLM normalizes "film" to "movie" at classification time
      const suggestions = [
        createSuggestion('Watch a movie', { action: 'watch', object: 'movie' }),
        createSuggestion('Watch a film', { action: 'watch', object: 'movie' }) // LLM normalized
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should cluster normalized hiking synonyms', () => {
      // LLM normalizes "tramping" and "trekking" to "hike" at classification time
      const suggestions = [
        createSuggestion('Go hiking', { action: 'hike', actionOriginal: 'hiking' }),
        createSuggestion('Go tramping', { action: 'hike', actionOriginal: 'tramping' }),
        createSuggestion('Go trekking', { action: 'hike', actionOriginal: 'trekking' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })

    it('should cluster restaurant visits by venue', () => {
      const suggestions = [
        createSuggestion('Try Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' }),
        createSuggestion('Go to Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' }),
        createSuggestion('Dinner at Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })

    it('should NOT cluster different venues', () => {
      const suggestions = [
        createSuggestion('Try Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' }),
        createSuggestion('Try Depot', { action: 'eat', venue: 'Depot', city: 'Auckland' })
      ]

      const result = clusterSuggestions(suggestions)

      expect(result.clusters.length).toBe(2)
    })
  })
})
