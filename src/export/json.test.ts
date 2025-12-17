import { describe, expect, it } from 'vitest'
import type { GeocodedSuggestion } from '../types.js'
import { exportToJSON } from './json.js'

function createSuggestion(
  id: number,
  activity: string,
  category: string = 'restaurant'
): GeocodedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    location: 'Test Location',
    activityScore: 0.8,
    category: category as GeocodedSuggestion['category'],
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    latitude: 41.9,
    longitude: 12.5,
    isMappable: true
  }
}

describe('JSON Export', () => {
  describe('exportToJSON', () => {
    it('returns valid JSON', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const json = exportToJSON(suggestions)

      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('includes suggestions array', () => {
      const suggestions = [createSuggestion(1, 'Dinner'), createSuggestion(2, 'Hiking')]

      const json = exportToJSON(suggestions)
      const parsed = JSON.parse(json)

      expect(parsed.suggestions).toHaveLength(2)
    })

    it('preserves suggestion properties', () => {
      const suggestions = [createSuggestion(1, 'Italian Dinner', 'restaurant')]

      const json = exportToJSON(suggestions)
      const parsed = JSON.parse(json)

      expect(parsed.suggestions[0].activity).toBe('Italian Dinner')
      expect(parsed.suggestions[0].category).toBe('restaurant')
      expect(parsed.suggestions[0].latitude).toBe(41.9)
      expect(parsed.suggestions[0].longitude).toBe(12.5)
    })

    it('includes metadata when provided', () => {
      const suggestions = [createSuggestion(1, 'Test')]
      const metadata = {
        inputFile: 'chat.txt',
        messageCount: 1000,
        version: '1.0.0'
      }

      const json = exportToJSON(suggestions, metadata)
      const parsed = JSON.parse(json)

      expect(parsed.metadata.inputFile).toBe('chat.txt')
      expect(parsed.metadata.messageCount).toBe(1000)
      expect(parsed.metadata.version).toBe('1.0.0')
    })

    it('includes generated timestamp', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const json = exportToJSON(suggestions)
      const parsed = JSON.parse(json)

      expect(parsed.metadata.generatedAt).toBeDefined()
      expect(new Date(parsed.metadata.generatedAt)).toBeInstanceOf(Date)
    })

    it('includes suggestionCount in metadata', () => {
      const suggestions = [
        createSuggestion(1, 'One'),
        createSuggestion(2, 'Two'),
        createSuggestion(3, 'Three')
      ]

      const json = exportToJSON(suggestions)
      const parsed = JSON.parse(json)

      expect(parsed.metadata.suggestionCount).toBe(3)
    })

    it('handles empty suggestions array', () => {
      const json = exportToJSON([])
      const parsed = JSON.parse(json)

      expect(parsed.suggestions).toHaveLength(0)
      expect(parsed.metadata.suggestionCount).toBe(0)
    })

    it('serializes dates as ISO strings', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const json = exportToJSON(suggestions)
      const parsed = JSON.parse(json)

      // The timestamp should be serialized to ISO string
      expect(parsed.suggestions[0].timestamp).toBe('2025-01-15T10:30:00.000Z')
    })

    it('pretty prints JSON with indentation', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const json = exportToJSON(suggestions)

      expect(json).toContain('\n')
      expect(json).toContain('  ')
    })

    it('handles suggestions without coordinates', () => {
      const suggestion: GeocodedSuggestion = {
        messageId: 1,
        isActivity: true,
        activity: 'No location',
        activityScore: 0.8,
        category: 'other',
        confidence: 0.9,
        originalMessage: 'Message',
        sender: 'User',
        timestamp: new Date(),
        isMappable: false
      }

      const json = exportToJSON([suggestion])
      const parsed = JSON.parse(json)

      expect(parsed.suggestions[0].latitude).toBeUndefined()
      expect(parsed.suggestions[0].longitude).toBeUndefined()
    })

    it('includes geocodedCount in metadata', () => {
      const withCoords = createSuggestion(1, 'With coords')
      const withoutCoords: GeocodedSuggestion = {
        messageId: 2,
        isActivity: true,
        activity: 'Without coords',
        activityScore: 0.8,
        category: 'other',
        confidence: 0.9,
        originalMessage: 'Message',
        sender: 'User',
        timestamp: new Date(),
        isMappable: false
      }

      const json = exportToJSON([withCoords, withoutCoords])
      const parsed = JSON.parse(json)

      expect(parsed.metadata.geocodedCount).toBe(1)
    })

    it('uses default version when not provided', () => {
      const json = exportToJSON([createSuggestion(1, 'Test')])
      const parsed = JSON.parse(json)

      expect(parsed.metadata.version).toBe('1.0.0')
    })
  })
})
