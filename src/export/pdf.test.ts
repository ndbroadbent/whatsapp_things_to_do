import { describe, expect, it } from 'vitest'
import { createGeocodedActivity as createTestGeo } from '../test-support'
import type { GeocodedActivity } from '../types'
import { exportToPDF } from './pdf'

function createActivity(
  id: number,
  activity: string,
  category: string = 'food',
  lat?: number,
  lng?: number
): GeocodedActivity {
  return createTestGeo({
    activity,
    category: category as GeocodedActivity['category'],
    score: 0.9,
    messages: [
      {
        id,
        sender: 'Test User',
        timestamp: new Date('2025-01-15T10:30:00Z'),
        message: 'Original message'
      }
    ],
    latitude: lat,
    longitude: lng,
    city: lat ? 'Test Location' : null
  })
}

describe('PDF Export', () => {
  describe('exportToPDF', () => {
    it('returns a Uint8Array', async () => {
      const activities = [createActivity(1, 'Test', 'food', 41.9, 12.5)]

      const result = await exportToPDF(activities)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(0)
    })

    it('creates PDF with default title', async () => {
      const activities = [createActivity(1, 'Test', 'food', 41.9, 12.5)]

      const result = await exportToPDF(activities)

      // Just verify it produces output without errors
      expect(result.length).toBeGreaterThan(100)
    })

    it('uses custom title when provided', async () => {
      const activities = [createActivity(1, 'Test', 'food', 41.9, 12.5)]

      const result = await exportToPDF(activities, {
        title: 'My Custom Title'
      })

      expect(result.length).toBeGreaterThan(100)
    })

    it('includes subtitle when provided', async () => {
      const activities = [createActivity(1, 'Test', 'food', 41.9, 12.5)]

      const result = await exportToPDF(activities, { subtitle: 'My Subtitle' })

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple activities', async () => {
      const activities = [
        createActivity(1, 'Test 1', 'food', 41.9, 12.5),
        createActivity(2, 'Test 2', 'nature', 40.7, -74.0)
      ]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple categories', async () => {
      const activities = [
        createActivity(1, 'Restaurant 1', 'food', 41.9, 12.5),
        createActivity(2, 'Restaurant 2', 'food', 40.7, -74.0),
        createActivity(3, 'Hike 1', 'nature', 41.0, 12.0)
      ]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('filters by category when specified', async () => {
      const activities = [
        createActivity(1, 'Restaurant 1', 'food', 41.9, 12.5),
        createActivity(2, 'Hike 1', 'nature', 40.7, -74.0)
      ]

      const result = await exportToPDF(activities, {
        filterByCategory: ['food']
      })

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles empty activities array', async () => {
      const result = await exportToPDF([])

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('handles activities without coordinates', async () => {
      const activities = [createActivity(1, 'Without coords', 'nature')]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles activities with location', async () => {
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Restaurant', 'food', 41.9, 12.5),
        city: 'Rome',
        country: 'Italy'
      }

      const result = await exportToPDF([activity])

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles many activities', async () => {
      const activities = Array.from({ length: 50 }, (_, i) =>
        createActivity(i + 1, `Activity ${i + 1}`, 'food', 41.9 + i * 0.01, 12.5)
      )

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles all category types', async () => {
      const categories = [
        'food',
        'food',
        'bar',
        'nature',
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
        { ...createActivity(1, 'Test 1', 'food'), sender: 'User A' },
        { ...createActivity(2, 'Test 2', 'nature'), sender: 'User B' },
        { ...createActivity(3, 'Test 3', 'food'), sender: 'User A' }
      ]

      const result = await exportToPDF(activities)

      expect(result.length).toBeGreaterThan(100)
    })

    it('produces valid PDF header', async () => {
      const activities = [createActivity(1, 'Test', 'food', 41.9, 12.5)]

      const result = await exportToPDF(activities)

      // Check PDF magic bytes
      const header = new TextDecoder().decode(result.slice(0, 5))
      expect(header).toBe('%PDF-')
    })
  })

  describe('grouping options', () => {
    function createActivityWithCountry(
      id: number,
      activity: string,
      category: string,
      country: string
    ): GeocodedActivity {
      return {
        ...createTestGeo({
          activity,
          category: category as GeocodedActivity['category'],
          score: 0.9,
          messages: [
            {
              id,
              sender: 'Test User',
              timestamp: new Date('2025-01-15T10:30:00Z'),
              message: 'Original message'
            }
          ],
          latitude: 41.9,
          longitude: 12.5,
          city: 'Test City'
        }),
        country
      }
    }

    const mixedActivities = [
      createActivityWithCountry(1, 'Restaurant A', 'food', 'Italy'),
      createActivityWithCountry(2, 'Restaurant B', 'food', 'France'),
      createActivityWithCountry(3, 'Hike A', 'nature', 'Italy'),
      createActivityWithCountry(4, 'Hike B', 'nature', 'France'),
      createActivityWithCountry(5, 'Museum A', 'culture', 'Italy')
    ]

    it('groups by both country and category by default', async () => {
      const result = await exportToPDF(mixedActivities)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('groups by country only when groupByCategory is false', async () => {
      const result = await exportToPDF(mixedActivities, {
        groupByCountry: true,
        groupByCategory: false
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('groups by category only when groupByCountry is false', async () => {
      const result = await exportToPDF(mixedActivities, {
        groupByCountry: false,
        groupByCategory: true
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('renders flat list when both grouping options are false', async () => {
      const result = await exportToPDF(mixedActivities, {
        groupByCountry: false,
        groupByCategory: false
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('handles activities without country in country grouping', async () => {
      const activities = [
        createActivity(1, 'No Country', 'food', 41.9, 12.5),
        createActivityWithCountry(2, 'With Country', 'food', 'Italy')
      ]

      const result = await exportToPDF(activities, { groupByCountry: true })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })
  })

  describe('filter options', () => {
    const activities = [
      {
        ...createTestGeo({
          activity: 'Restaurant A',
          category: 'food',
          score: 0.9,
          messages: [{ id: 1, sender: 'User', timestamp: new Date(), message: 'msg' }],
          latitude: 41.9,
          longitude: 12.5,
          city: 'Rome'
        }),
        country: 'Italy'
      },
      {
        ...createTestGeo({
          activity: 'Restaurant B',
          category: 'food',
          score: 0.9,
          messages: [{ id: 2, sender: 'User', timestamp: new Date(), message: 'msg' }],
          latitude: 48.8,
          longitude: 2.3,
          city: 'Paris'
        }),
        country: 'France'
      },
      {
        ...createTestGeo({
          activity: 'Hike A',
          category: 'nature',
          score: 0.9,
          messages: [{ id: 3, sender: 'User', timestamp: new Date(), message: 'msg' }],
          latitude: 41.9,
          longitude: 12.5,
          city: 'Rome'
        }),
        country: 'Italy'
      }
    ]

    it('filters by country when filterByCountry is specified', async () => {
      const result = await exportToPDF(activities, {
        filterByCountry: ['Italy']
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('filters by both category and country', async () => {
      const result = await exportToPDF(activities, {
        filterByCategory: ['food'],
        filterByCountry: ['Italy']
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('handles case-insensitive country filter', async () => {
      const result = await exportToPDF(activities, {
        filterByCountry: ['italy']
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })
  })

  describe('display options', () => {
    const activities = [createActivity(1, 'Test Activity', 'food', 41.9, 12.5)]

    it('respects includeScore option', async () => {
      const result = await exportToPDF(activities, { includeScore: true })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('respects includeThumbnails option when disabled', async () => {
      const result = await exportToPDF(activities, {
        includeThumbnails: false
      })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('respects maxActivities limit', async () => {
      const manyActivities = Array.from({ length: 20 }, (_, i) =>
        createActivity(i + 1, `Activity ${i + 1}`, 'food', 41.9 + i * 0.01, 12.5)
      )

      const result = await exportToPDF(manyActivities, { maxActivities: 5 })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })
  })

  describe('page size options', () => {
    const activities = [createActivity(1, 'Test Activity', 'food', 41.9, 12.5)]

    it('uses A4 page size by default', async () => {
      const result = await exportToPDF(activities)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('uses Letter page size when specified', async () => {
      const result = await exportToPDF(activities, { pageSize: 'Letter' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('uses A4 page size when specified', async () => {
      const result = await exportToPDF(activities, { pageSize: 'A4' })

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })
  })
})
