import { describe, expect, it } from 'vitest'
import type { GeocodedActivity } from '../types'
import { exportToPDF } from './pdf'

function createActivity(
  id: number,
  activity: string,
  category: string = 'restaurant',
  lat?: number,
  lng?: number
): GeocodedActivity {
  return {
    messageId: id,

    activity,
    funScore: 0.7,
    interestingScore: 0.5,
    category: category as GeocodedActivity['category'],
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    latitude: lat,
    longitude: lng,
    isGeneric: true,
    isCompound: false,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city: lat ? 'Test Location' : null,
    region: null,
    country: null
  }
}

describe('PDF Export', () => {
  describe('exportToPDF', () => {
    it('returns a Uint8Array', async () => {
      const activities = [createActivity(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(activities)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(0)
    })

    it('creates PDF with default title', async () => {
      const activities = [createActivity(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(activities)

      // Just verify it produces output without errors
      expect(result.length).toBeGreaterThan(100)
    })

    it('uses custom title when provided', async () => {
      const activities = [createActivity(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(activities, { title: 'My Custom Title' })

      expect(result.length).toBeGreaterThan(100)
    })

    it('includes subtitle when provided', async () => {
      const activities = [createActivity(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(activities, { subtitle: 'My Subtitle' })

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple activities', async () => {
      const activities = [
        createActivity(1, 'Test 1', 'restaurant', 41.9, 12.5),
        createActivity(2, 'Test 2', 'hike', 40.7, -74.0)
      ]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple categories', async () => {
      const activities = [
        createActivity(1, 'Restaurant 1', 'restaurant', 41.9, 12.5),
        createActivity(2, 'Restaurant 2', 'restaurant', 40.7, -74.0),
        createActivity(3, 'Hike 1', 'hike', 41.0, 12.0)
      ]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('filters by category when specified', async () => {
      const activities = [
        createActivity(1, 'Restaurant 1', 'restaurant', 41.9, 12.5),
        createActivity(2, 'Hike 1', 'hike', 40.7, -74.0)
      ]

      const result = await exportToPDF(activities, { filterByCategory: ['restaurant'] })

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles empty activities array', async () => {
      const result = await exportToPDF([])

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('handles activities without coordinates', async () => {
      const activities = [createActivity(1, 'Without coords', 'hike')]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles activities with location', async () => {
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Restaurant', 'restaurant', 41.9, 12.5),
        city: 'Rome',
        country: 'Italy'
      }

      const result = await exportToPDF([activity])

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles many activities', async () => {
      const activities = Array.from({ length: 50 }, (_, i) =>
        createActivity(i + 1, `Activity ${i + 1}`, 'restaurant', 41.9 + i * 0.01, 12.5)
      )

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles all category types', async () => {
      const categories = [
        'restaurant',
        'cafe',
        'bar',
        'hike',
        'nature',
        'beach',
        'trip',
        'hotel',
        'event',
        'concert',
        'museum',
        'entertainment',
        'adventure',
        'family',
        'errand',
        'appointment',
        'other'
      ]
      const activities = categories.map((cat, i) =>
        createActivity(i + 1, `${cat} Activity`, cat, 41.9, 12.5)
      )

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple senders', async () => {
      const activities = [
        { ...createActivity(1, 'Test 1', 'restaurant'), sender: 'User A' },
        { ...createActivity(2, 'Test 2', 'hike'), sender: 'User B' },
        { ...createActivity(3, 'Test 3', 'cafe'), sender: 'User A' }
      ]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('produces valid PDF header', async () => {
      const activities = [createActivity(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(activities)

      // Check PDF magic bytes
      const header = new TextDecoder().decode(result.slice(0, 5))
      expect(header).toBe('%PDF-')
    })
  })
})
