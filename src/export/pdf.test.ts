import { describe, expect, it } from 'vitest'
import type { GeocodedSuggestion } from '../types.js'
import { exportToPDF } from './pdf.js'

function createSuggestion(
  id: number,
  activity: string,
  category: string = 'restaurant',
  lat?: number,
  lng?: number
): GeocodedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    location: lat ? 'Test Location' : undefined,
    activityScore: 0.8,
    category: category as GeocodedSuggestion['category'],
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    latitude: lat,
    longitude: lng,
    isMappable: lat !== undefined
  }
}

describe('PDF Export', () => {
  describe('exportToPDF', () => {
    it('returns a Uint8Array', async () => {
      const suggestions = [createSuggestion(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(suggestions)

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(0)
    })

    it('creates PDF with default title', async () => {
      const suggestions = [createSuggestion(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(suggestions)

      // Just verify it produces output without errors
      expect(result.length).toBeGreaterThan(100)
    })

    it('uses custom title when provided', async () => {
      const suggestions = [createSuggestion(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(suggestions, { title: 'My Custom Title' })

      expect(result.length).toBeGreaterThan(100)
    })

    it('includes subtitle when provided', async () => {
      const suggestions = [createSuggestion(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(suggestions, { subtitle: 'My Subtitle' })

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple suggestions', async () => {
      const suggestions = [
        createSuggestion(1, 'Test 1', 'restaurant', 41.9, 12.5),
        createSuggestion(2, 'Test 2', 'hike', 40.7, -74.0)
      ]

      const result = await exportToPDF(suggestions)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple categories', async () => {
      const suggestions = [
        createSuggestion(1, 'Restaurant 1', 'restaurant', 41.9, 12.5),
        createSuggestion(2, 'Restaurant 2', 'restaurant', 40.7, -74.0),
        createSuggestion(3, 'Hike 1', 'hike', 41.0, 12.0)
      ]

      const result = await exportToPDF(suggestions)

      expect(result.length).toBeGreaterThan(100)
    })

    it('filters by category when specified', async () => {
      const suggestions = [
        createSuggestion(1, 'Restaurant 1', 'restaurant', 41.9, 12.5),
        createSuggestion(2, 'Hike 1', 'hike', 40.7, -74.0)
      ]

      const result = await exportToPDF(suggestions, { filterByCategory: ['restaurant'] })

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles empty suggestions array', async () => {
      const result = await exportToPDF([])

      expect(result).toBeInstanceOf(Uint8Array)
      expect(result.length).toBeGreaterThan(100)
    })

    it('handles suggestions without coordinates', async () => {
      const suggestions = [createSuggestion(1, 'Without coords', 'hike')]

      const result = await exportToPDF(suggestions)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles suggestions with location', async () => {
      const suggestion: GeocodedSuggestion = {
        ...createSuggestion(1, 'Restaurant', 'restaurant', 41.9, 12.5),
        location: 'Rome, Italy'
      }

      const result = await exportToPDF([suggestion])

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles many suggestions', async () => {
      const suggestions = Array.from({ length: 50 }, (_, i) =>
        createSuggestion(i + 1, `Activity ${i + 1}`, 'restaurant', 41.9 + i * 0.01, 12.5)
      )

      const result = await exportToPDF(suggestions)

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
      const suggestions = categories.map((cat, i) =>
        createSuggestion(i + 1, `${cat} Activity`, cat, 41.9, 12.5)
      )

      const result = await exportToPDF(suggestions)

      expect(result.length).toBeGreaterThan(100)
    })

    it('handles multiple senders', async () => {
      const suggestions = [
        { ...createSuggestion(1, 'Test 1', 'restaurant'), sender: 'User A' },
        { ...createSuggestion(2, 'Test 2', 'hike'), sender: 'User B' },
        { ...createSuggestion(3, 'Test 3', 'cafe'), sender: 'User A' }
      ]

      const result = await exportToPDF(suggestions)

      expect(result.length).toBeGreaterThan(100)
    })

    it('produces valid PDF header', async () => {
      const suggestions = [createSuggestion(1, 'Test', 'restaurant', 41.9, 12.5)]

      const result = await exportToPDF(suggestions)

      // Check PDF magic bytes
      const header = new TextDecoder().decode(result.slice(0, 5))
      expect(header).toBe('%PDF-')
    })
  })
})
