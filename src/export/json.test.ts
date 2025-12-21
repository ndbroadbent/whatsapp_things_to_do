import { describe, expect, it } from 'vitest'
import type { GeocodedActivity } from '../types.js'
import { exportToJSON } from './json.js'

function createActivity(
  id: number,
  activity: string,
  category: string = 'restaurant'
): GeocodedActivity {
  return {
    messageId: id,
    isActivity: true,
    activity,
    activityScore: 0.8,
    category: category as GeocodedActivity['category'],
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    latitude: 41.9,
    longitude: 12.5,
    isGeneric: true,
    isComplete: true,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city: 'Test Location',
    state: null,
    country: null
  }
}

describe('JSON Export', () => {
  describe('exportToJSON', () => {
    it('returns valid JSON', () => {
      const activities = [createActivity(1, 'Test')]

      const json = exportToJSON(activities)

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('includes activities array', () => {
      const activities = [createActivity(1, 'Dinner'), createActivity(2, 'Hiking')]

      const json = exportToJSON(activities)
      const parsed = JSON.parse(json)

      expect(parsed.activities).toHaveLength(2)
    })

    it('preserves activity properties', () => {
      const activities = [createActivity(1, 'Italian Dinner', 'restaurant')]

      const json = exportToJSON(activities)
      const parsed = JSON.parse(json)

      expect(parsed.activities[0].activity).toBe('Italian Dinner')
      expect(parsed.activities[0].category).toBe('restaurant')
      expect(parsed.activities[0].latitude).toBe(41.9)
      expect(parsed.activities[0].longitude).toBe(12.5)
    })

    it('includes metadata when provided', () => {
      const activities = [createActivity(1, 'Test')]
      const metadata = {
        inputFile: 'chat.txt',
        messageCount: 1000,
        version: '1.0.0'
      }

      const json = exportToJSON(activities, metadata)
      const parsed = JSON.parse(json)

      expect(parsed.metadata.inputFile).toBe('chat.txt')
      expect(parsed.metadata.messageCount).toBe(1000)
      expect(parsed.metadata.version).toBe('1.0.0')
    })

    it('includes generated timestamp', () => {
      const activities = [createActivity(1, 'Test')]

      const json = exportToJSON(activities)
      const parsed = JSON.parse(json)

      expect(parsed.metadata.generatedAt).toBeDefined()
      expect(new Date(parsed.metadata.generatedAt)).toBeInstanceOf(Date)
    })

    it('includes activityCount in metadata', () => {
      const activities = [
        createActivity(1, 'One'),
        createActivity(2, 'Two'),
        createActivity(3, 'Three')
      ]

      const json = exportToJSON(activities)
      const parsed = JSON.parse(json)

      expect(parsed.metadata.activityCount).toBe(3)
    })

    it('handles empty activities array', () => {
      const json = exportToJSON([])
      const parsed = JSON.parse(json)

      expect(parsed.activities).toHaveLength(0)
      expect(parsed.metadata.activityCount).toBe(0)
    })

    it('serializes dates as ISO strings', () => {
      const activities = [createActivity(1, 'Test')]

      const json = exportToJSON(activities)
      const parsed = JSON.parse(json)

      // The timestamp should be serialized to ISO string
      expect(parsed.activities[0].timestamp).toBe('2025-01-15T10:30:00.000Z')
    })

    it('pretty prints JSON with indentation', () => {
      const activities = [createActivity(1, 'Test')]

      const json = exportToJSON(activities)

      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })

    it('handles activities without coordinates', () => {
      const activity: GeocodedActivity = {
        messageId: 1,
        isActivity: true,
        activity: 'No location',
        activityScore: 0.8,
        category: 'other',
        confidence: 0.9,
        originalMessage: 'Message',
        sender: 'User',
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
        country: null
      }

      const json = exportToJSON([activity])
      const parsed = JSON.parse(json)

      expect(parsed.activities[0].latitude).toBeUndefined()
      expect(parsed.activities[0].longitude).toBeUndefined()
    })

    it('includes geocodedCount in metadata', () => {
      const withCoords = createActivity(1, 'With coords')
      const withoutCoords: GeocodedActivity = {
        messageId: 2,
        isActivity: true,
        activity: 'Without coords',
        activityScore: 0.8,
        category: 'other',
        confidence: 0.9,
        originalMessage: 'Message',
        sender: 'User',
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
        country: null
      }

      const json = exportToJSON([withCoords, withoutCoords])
      const parsed = JSON.parse(json)

      expect(parsed.metadata.geocodedCount).toBe(1)
    })

    it('uses default version when not provided', () => {
      const json = exportToJSON([createActivity(1, 'Test')])
      const parsed = JSON.parse(json)

      expect(parsed.metadata.version).toBe('1.0.0')
    })
  })
})
