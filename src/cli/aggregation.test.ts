import { describe, expect, it } from 'vitest'
import type { ClassifiedSuggestion, GeocodedSuggestion } from '../types.js'
import {
  aggregateGeocodedSuggestions,
  aggregateSuggestions,
  filterByMentionCount,
  getMostWanted
} from './aggregation.js'

function createSuggestion(
  id: number,
  activity: string,
  location?: string,
  timestamp?: Date,
  sender = 'User'
): ClassifiedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    location,
    activityScore: 0.8,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: `Let's do ${activity}`,
    sender,
    timestamp: timestamp ?? new Date('2025-01-15T10:00:00Z'),
    isMappable: location !== undefined
  }
}

function createGeocodedSuggestion(
  id: number,
  activity: string,
  location?: string,
  lat?: number,
  lng?: number,
  timestamp?: Date
): GeocodedSuggestion {
  return {
    ...createSuggestion(id, activity, location, timestamp),
    latitude: lat,
    longitude: lng
  }
}

describe('Aggregation Module', () => {
  describe('aggregateSuggestions', () => {
    it('returns empty array for empty input', () => {
      const result = aggregateSuggestions([])
      expect(result).toEqual([])
    })

    it('returns single suggestion unchanged (as aggregated)', () => {
      const suggestions = [createSuggestion(1, 'Dinner at Italian Place', 'Rome')]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.mentionCount).toBe(1)
      expect(result[0]?.sourceMessages).toHaveLength(1)
    })

    it('groups by exact location match (case-insensitive)', () => {
      const suggestions = [
        createSuggestion(1, 'Visit Queenstown', 'Queenstown'),
        createSuggestion(2, 'Go to queenstown', 'queenstown'),
        createSuggestion(3, 'QUEENSTOWN trip', 'QUEENSTOWN')
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.mentionCount).toBe(3)
      expect(result[0]?.sourceMessages).toHaveLength(3)
    })

    it('groups by activity name similarity', () => {
      const suggestions = [
        createSuggestion(1, 'pottery class'),
        createSuggestion(2, 'Pottery Class'),
        createSuggestion(3, 'pottery classes')
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.mentionCount).toBe(3)
    })

    it('does not group dissimilar activities', () => {
      const suggestions = [
        createSuggestion(1, 'pottery class'),
        createSuggestion(2, 'cooking class'),
        createSuggestion(3, 'yoga class')
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(3)
      expect(result.every((r) => r.mentionCount === 1)).toBe(true)
    })

    it('calculates correct date range', () => {
      const suggestions = [
        createSuggestion(1, 'pottery', undefined, new Date('2022-01-15')),
        createSuggestion(2, 'pottery', undefined, new Date('2023-06-20')),
        createSuggestion(3, 'pottery', undefined, new Date('2024-12-01'))
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.firstMentionedAt).toEqual(new Date('2022-01-15'))
      expect(result[0]?.lastMentionedAt).toEqual(new Date('2024-12-01'))
    })

    it('preserves all source messages', () => {
      const suggestions = [
        createSuggestion(1, 'Dinner', 'The Restaurant', new Date('2022-01-01'), 'Alice'),
        createSuggestion(2, 'dinner', 'the restaurant', new Date('2023-01-01'), 'Bob'),
        createSuggestion(3, 'Dinner', 'The Restaurant', new Date('2024-01-01'), 'Charlie')
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.sourceMessages).toHaveLength(3)

      const senders = result[0]?.sourceMessages.map((m) => m.sender)
      expect(senders).toContain('Alice')
      expect(senders).toContain('Bob')
      expect(senders).toContain('Charlie')
    })

    it('sorts by mention count (most wanted first)', () => {
      const suggestions = [
        createSuggestion(1, 'mentioned once'),
        createSuggestion(2, 'pottery class'),
        createSuggestion(3, 'pottery class'),
        createSuggestion(4, 'pottery class'),
        createSuggestion(5, 'hiking trip'),
        createSuggestion(6, 'hiking trip')
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(3)
      expect(result[0]?.mentionCount).toBe(3) // pottery
      expect(result[1]?.mentionCount).toBe(2) // hiking
      expect(result[2]?.mentionCount).toBe(1) // once
    })

    it('uses most recent mention as base suggestion', () => {
      const suggestions = [
        createSuggestion(1, 'pottery class', 'Old Location', new Date('2022-01-01')),
        createSuggestion(2, 'Pottery Class', 'New Location', new Date('2024-01-01'))
      ]

      const result = aggregateSuggestions(suggestions)

      expect(result).toHaveLength(1)
      // Should use the newer suggestion's details (most recent has best info)
      expect(result[0]?.activity).toBe('Pottery Class')
      expect(result[0]?.location).toBe('New Location')
    })
  })

  describe('aggregateGeocodedSuggestions', () => {
    it('preserves geocoding information', () => {
      const suggestions = [
        createGeocodedSuggestion(1, 'Coffee Lab', 'Wellington', -41.29, 174.78),
        createGeocodedSuggestion(2, 'coffee lab', 'wellington', -41.29, 174.78)
      ]

      const result = aggregateGeocodedSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.latitude).toBe(-41.29)
      expect(result[0]?.longitude).toBe(174.78)
    })

    it('handles suggestions without coordinates', () => {
      const suggestions = [
        createGeocodedSuggestion(1, 'See a movie'),
        createGeocodedSuggestion(2, 'see a movie')
      ]

      const result = aggregateGeocodedSuggestions(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.latitude).toBeUndefined()
    })
  })

  describe('filterByMentionCount', () => {
    it('filters suggestions below minimum count', () => {
      const suggestions = [
        { ...createSuggestion(1, 'A'), mentionCount: 1 },
        { ...createSuggestion(2, 'B'), mentionCount: 3 },
        { ...createSuggestion(3, 'C'), mentionCount: 5 }
      ] as unknown as ReturnType<typeof aggregateSuggestions>

      const result = filterByMentionCount(suggestions, 3)

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.mentionCount)).toEqual([3, 5])
    })
  })

  describe('getMostWanted', () => {
    it('returns only suggestions mentioned more than once', () => {
      const raw = [
        createSuggestion(1, 'once'),
        createSuggestion(2, 'twice'),
        createSuggestion(3, 'twice'),
        createSuggestion(4, 'thrice'),
        createSuggestion(5, 'thrice'),
        createSuggestion(6, 'thrice')
      ]

      const aggregated = aggregateSuggestions(raw)
      const result = getMostWanted(aggregated)

      expect(result).toHaveLength(2)
      expect(result.every((r) => r.mentionCount > 1)).toBe(true)
    })

    it('respects limit parameter', () => {
      const raw = [
        createSuggestion(1, 'a'),
        createSuggestion(2, 'a'),
        createSuggestion(3, 'b'),
        createSuggestion(4, 'b'),
        createSuggestion(5, 'c'),
        createSuggestion(6, 'c')
      ]

      const aggregated = aggregateSuggestions(raw)
      const result = getMostWanted(aggregated, 2)

      expect(result).toHaveLength(2)
    })
  })
})
