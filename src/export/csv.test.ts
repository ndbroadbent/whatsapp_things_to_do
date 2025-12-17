import { describe, expect, it } from 'vitest'
import type { GeocodedSuggestion } from '../types.js'
import { exportToCSV } from './csv.js'

function createSuggestion(
  id: number,
  activity: string,
  location?: string,
  lat?: number,
  lng?: number
): GeocodedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    location,
    activityScore: 0.8,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: 'Original message content',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    latitude: lat,
    longitude: lng,
    isMappable: location !== undefined
  }
}

describe('CSV Export', () => {
  describe('exportToCSV', () => {
    it('includes header row', () => {
      const suggestions = [createSuggestion(1, 'Dinner')]

      const csv = exportToCSV(suggestions)
      const lines = csv.split('\n')

      expect(lines[0]).toContain('id')
      expect(lines[0]).toContain('date')
      expect(lines[0]).toContain('sender')
      expect(lines[0]).toContain('activity')
      expect(lines[0]).toContain('location')
      expect(lines[0]).toContain('latitude')
      expect(lines[0]).toContain('longitude')
      expect(lines[0]).toContain('category')
    })

    it('exports single suggestion', () => {
      const suggestions = [createSuggestion(1, 'Dinner at Italian Place', 'Rome', 41.9, 12.5)]

      const csv = exportToCSV(suggestions)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(2) // header + 1 data row
      expect(lines[1]).toContain('Dinner at Italian Place')
      expect(lines[1]).toContain('Rome')
      expect(lines[1]).toContain('41.9')
      expect(lines[1]).toContain('12.5')
    })

    it('exports multiple suggestions', () => {
      const suggestions = [
        createSuggestion(1, 'Dinner'),
        createSuggestion(2, 'Hiking'),
        createSuggestion(3, 'Beach day')
      ]

      const csv = exportToCSV(suggestions)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(4) // header + 3 data rows
    })

    it('uses 1-indexed IDs in output', () => {
      const suggestions = [createSuggestion(42, 'Test')]

      const csv = exportToCSV(suggestions)
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      // First column should be "1" not "42"
      expect(dataLine.startsWith('1,')).toBe(true)
    })

    it('handles missing location', () => {
      const suggestions = [createSuggestion(1, 'No location activity')]

      const csv = exportToCSV(suggestions)

      expect(csv).not.toContain('undefined')
    })

    it('handles missing coordinates', () => {
      const suggestions = [createSuggestion(1, 'No coords', 'Some Place')]

      const csv = exportToCSV(suggestions)
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      // Should have empty values for lat/lng, not "undefined"
      expect(dataLine).not.toContain('undefined')
    })

    it('escapes commas in content', () => {
      const suggestion = createSuggestion(1, 'Italian, French, and Asian food')

      const csv = exportToCSV([suggestion])
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      expect(dataLine).toContain('"Italian, French, and Asian food"')
    })

    it('escapes quotes in content', () => {
      const suggestion = createSuggestion(1, 'The "Best" Restaurant')

      const csv = exportToCSV([suggestion])
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      expect(dataLine).toContain('""Best""')
    })

    it('escapes newlines in content', () => {
      const suggestion = createSuggestion(1, 'Line 1\nLine 2')

      const csv = exportToCSV([suggestion])

      // The content should be quoted to handle newline
      expect(csv).toContain('"')
    })

    it('includes Google Maps link when coordinates present', () => {
      const suggestions = [createSuggestion(1, 'Test', 'Place', 41.9, 12.5)]

      const csv = exportToCSV(suggestions)

      expect(csv).toContain('https://www.google.com/maps?q=41.9,12.5')
    })

    it('formats date as YYYY-MM-DD', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const csv = exportToCSV(suggestions)

      expect(csv).toContain('2025-01-15')
    })

    it('formats time as HH:MM:SS', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const csv = exportToCSV(suggestions)

      // Time format is HH:MM:SS (timezone-dependent)
      expect(csv).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('formats confidence as decimal', () => {
      const suggestions = [createSuggestion(1, 'Test')]

      const csv = exportToCSV(suggestions)

      expect(csv).toContain('0.90')
    })

    it('handles empty suggestions array', () => {
      const csv = exportToCSV([])
      const lines = csv.split('\n')

      expect(lines).toHaveLength(1) // Just header
    })

    it('truncates long messages', () => {
      const longMessage = 'A'.repeat(600)
      const suggestion: GeocodedSuggestion = {
        ...createSuggestion(1, 'Test'),
        originalMessage: longMessage
      }

      const csv = exportToCSV([suggestion])

      // Message should be truncated to 500 chars
      expect(csv.length).toBeLessThan(longMessage.length + 200)
    })

    it('replaces newlines in original message', () => {
      const suggestion: GeocodedSuggestion = {
        ...createSuggestion(1, 'Test'),
        originalMessage: 'Line 1\nLine 2\nLine 3'
      }

      const csv = exportToCSV([suggestion])

      // Newlines should be replaced with spaces in the original message column
      expect(csv).toContain('Line 1 Line 2 Line 3')
    })
  })
})
