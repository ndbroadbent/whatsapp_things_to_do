import { describe, expect, it } from 'vitest'
import type { ClassifiedActivity, GeocodedActivity } from '../types.js'
import {
  aggregateActivities,
  aggregateGeocodedActivities,
  filterByMentionCount,
  getMostWanted
} from './aggregation.js'

function createActivity(
  id: number,
  activity: string,
  city?: string,
  timestamp?: Date,
  sender = 'User'
): ClassifiedActivity {
  return {
    messageId: id,
    isActivity: true,
    activity,
    activityScore: 0.8,
    funScore: 0.7,
    interestingScore: 0.5,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: `Let's do ${activity}`,
    sender,
    timestamp: timestamp ?? new Date('2025-01-15T10:00:00Z'),
    isGeneric: true,
    isCompound: false,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city: city ?? null,
    region: null,
    country: null
  }
}

function createGeocodedActivity(
  id: number,
  activity: string,
  city?: string,
  lat?: number,
  lng?: number,
  timestamp?: Date
): GeocodedActivity {
  return {
    ...createActivity(id, activity, city, timestamp),
    latitude: lat,
    longitude: lng
  }
}

describe('Aggregation Module', () => {
  describe('aggregateActivities', () => {
    it('returns empty array for empty input', () => {
      const result = aggregateActivities([])
      expect(result).toEqual([])
    })

    it('returns single suggestion unchanged (as aggregated)', () => {
      const suggestions = [createActivity(1, 'Dinner at Italian Place', 'Rome')]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.mentionCount).toBe(1)
      expect(result[0]?.sourceMessages).toHaveLength(1)
    })

    it('groups by exact location match (case-insensitive)', () => {
      const suggestions = [
        createActivity(1, 'Visit Queenstown', 'Queenstown'),
        createActivity(2, 'Go to queenstown', 'queenstown'),
        createActivity(3, 'QUEENSTOWN trip', 'QUEENSTOWN')
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.mentionCount).toBe(3)
      expect(result[0]?.sourceMessages).toHaveLength(3)
    })

    it('groups by activity name similarity', () => {
      const suggestions = [
        createActivity(1, 'pottery class'),
        createActivity(2, 'Pottery Class'),
        createActivity(3, 'pottery classes')
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.mentionCount).toBe(3)
    })

    it('does not group dissimilar activities', () => {
      const suggestions = [
        createActivity(1, 'pottery class'),
        createActivity(2, 'cooking class'),
        createActivity(3, 'yoga class')
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(3)
      expect(result.every((r) => r.mentionCount === 1)).toBe(true)
    })

    it('calculates correct date range', () => {
      const suggestions = [
        createActivity(1, 'pottery', undefined, new Date('2022-01-15')),
        createActivity(2, 'pottery', undefined, new Date('2023-06-20')),
        createActivity(3, 'pottery', undefined, new Date('2024-12-01'))
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.firstMentionedAt).toEqual(new Date('2022-01-15'))
      expect(result[0]?.lastMentionedAt).toEqual(new Date('2024-12-01'))
    })

    it('preserves all source messages', () => {
      const suggestions = [
        createActivity(1, 'Dinner', 'The Restaurant', new Date('2022-01-01'), 'Alice'),
        createActivity(2, 'dinner', 'the restaurant', new Date('2023-01-01'), 'Bob'),
        createActivity(3, 'Dinner', 'The Restaurant', new Date('2024-01-01'), 'Charlie')
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.sourceMessages).toHaveLength(3)

      const senders = result[0]?.sourceMessages.map((m) => m.sender)
      expect(senders).toContain('Alice')
      expect(senders).toContain('Bob')
      expect(senders).toContain('Charlie')
    })

    it('sorts by mention count (most wanted first)', () => {
      const suggestions = [
        createActivity(1, 'mentioned once'),
        createActivity(2, 'pottery class'),
        createActivity(3, 'pottery class'),
        createActivity(4, 'pottery class'),
        createActivity(5, 'hiking trip'),
        createActivity(6, 'hiking trip')
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(3)
      expect(result[0]?.mentionCount).toBe(3) // pottery
      expect(result[1]?.mentionCount).toBe(2) // hiking
      expect(result[2]?.mentionCount).toBe(1) // once
    })

    it('uses most recent mention as base suggestion', () => {
      const suggestions = [
        createActivity(1, 'pottery class', 'Old City', new Date('2022-01-01')),
        createActivity(2, 'Pottery Class', 'New City', new Date('2024-01-01'))
      ]

      const result = aggregateActivities(suggestions)

      expect(result).toHaveLength(1)
      // Should use the newer suggestion's details (most recent has best info)
      expect(result[0]?.activity).toBe('Pottery Class')
      expect(result[0]?.city).toBe('New City')
    })
  })

  describe('aggregateGeocodedActivities', () => {
    it('preserves geocoding information', () => {
      const suggestions = [
        createGeocodedActivity(1, 'Coffee Lab', 'Wellington', -41.29, 174.78),
        createGeocodedActivity(2, 'coffee lab', 'wellington', -41.29, 174.78)
      ]

      const result = aggregateGeocodedActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.latitude).toBe(-41.29)
      expect(result[0]?.longitude).toBe(174.78)
    })

    it('handles suggestions without coordinates', () => {
      const suggestions = [
        createGeocodedActivity(1, 'See a movie'),
        createGeocodedActivity(2, 'see a movie')
      ]

      const result = aggregateGeocodedActivities(suggestions)

      expect(result).toHaveLength(1)
      expect(result[0]?.latitude).toBeUndefined()
    })
  })

  describe('filterByMentionCount', () => {
    it('filters suggestions below minimum count', () => {
      const suggestions = [
        { ...createActivity(1, 'A'), mentionCount: 1 },
        { ...createActivity(2, 'B'), mentionCount: 3 },
        { ...createActivity(3, 'C'), mentionCount: 5 }
      ] as unknown as ReturnType<typeof aggregateActivities>

      const result = filterByMentionCount(suggestions, 3)

      expect(result).toHaveLength(2)
      expect(result.map((r) => r.mentionCount)).toEqual([3, 5])
    })
  })

  describe('getMostWanted', () => {
    it('returns only suggestions mentioned more than once', () => {
      const raw = [
        createActivity(1, 'once'),
        createActivity(2, 'twice'),
        createActivity(3, 'twice'),
        createActivity(4, 'thrice'),
        createActivity(5, 'thrice'),
        createActivity(6, 'thrice')
      ]

      const aggregated = aggregateActivities(raw)
      const result = getMostWanted(aggregated)

      expect(result).toHaveLength(2)
      expect(result.every((r) => r.mentionCount > 1)).toBe(true)
    })

    it('respects limit parameter', () => {
      const raw = [
        createActivity(1, 'a'),
        createActivity(2, 'a'),
        createActivity(3, 'b'),
        createActivity(4, 'b'),
        createActivity(5, 'c'),
        createActivity(6, 'c')
      ]

      const aggregated = aggregateActivities(raw)
      const result = getMostWanted(aggregated, 2)

      expect(result).toHaveLength(2)
    })
  })
})
