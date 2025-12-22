import { describe, expect, it } from 'vitest'
import type { GeocodedActivity } from '../types.js'
import { exportToCSV } from './csv.js'

function createActivity(
  id: number,
  activity: string,
  city?: string,
  lat?: number,
  lng?: number
): GeocodedActivity {
  return {
    messageId: id,
    isActivity: true,
    activity,
    activityScore: 0.8,
    funScore: 0.7,
    interestingScore: 0.5,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: 'Original message content',
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
    city: city ?? null,
    region: null,
    country: null
  }
}

describe('CSV Export', () => {
  describe('exportToCSV', () => {
    it('includes header row', () => {
      const activities = [createActivity(1, 'Dinner')]

      const csv = exportToCSV(activities)
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

    it('exports single activity', () => {
      const activities = [createActivity(1, 'Dinner at Italian Place', 'Rome', 41.9, 12.5)]

      const csv = exportToCSV(activities)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(2) // header + 1 data row
      expect(lines[1]).toContain('Dinner at Italian Place')
      expect(lines[1]).toContain('Rome')
      expect(lines[1]).toContain('41.9')
      expect(lines[1]).toContain('12.5')
    })

    it('exports multiple activities', () => {
      const activities = [
        createActivity(1, 'Dinner'),
        createActivity(2, 'Hiking'),
        createActivity(3, 'Beach day')
      ]

      const csv = exportToCSV(activities)
      const lines = csv.split('\n')

      expect(lines).toHaveLength(4) // header + 3 data rows
    })

    it('uses 1-indexed IDs in output', () => {
      const activities = [createActivity(42, 'Test')]

      const csv = exportToCSV(activities)
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      // First column should be "1" not "42"
      expect(dataLine.startsWith('1,')).toBe(true)
    })

    it('handles missing location', () => {
      const activities = [createActivity(1, 'No location activity')]

      const csv = exportToCSV(activities)

      expect(csv).not.toContain('undefined')
    })

    it('handles missing coordinates', () => {
      const activities = [createActivity(1, 'No coords', 'Some Place')]

      const csv = exportToCSV(activities)
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      // Should have empty values for lat/lng, not "undefined"
      expect(dataLine).not.toContain('undefined')
    })

    it('escapes commas in content', () => {
      const activity = createActivity(1, 'Italian, French, and Asian food')

      const csv = exportToCSV([activity])
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      expect(dataLine).toContain('"Italian, French, and Asian food"')
    })

    it('escapes quotes in content', () => {
      const activity = createActivity(1, 'The "Best" Restaurant')

      const csv = exportToCSV([activity])
      const lines = csv.split('\n')
      const dataLine = lines[1] ?? ''

      expect(dataLine).toContain('""Best""')
    })

    it('escapes newlines in content', () => {
      const activity = createActivity(1, 'Line 1\nLine 2')

      const csv = exportToCSV([activity])

      // The content should be quoted to handle newline
      expect(csv).toContain('"')
    })

    it('includes Google Maps link when coordinates present', () => {
      const activities = [createActivity(1, 'Test', 'Place', 41.9, 12.5)]

      const csv = exportToCSV(activities)

      expect(csv).toContain('https://www.google.com/maps?q=41.9,12.5')
    })

    it('formats date as YYYY-MM-DD', () => {
      const activities = [createActivity(1, 'Test')]

      const csv = exportToCSV(activities)

      expect(csv).toContain('2025-01-15')
    })

    it('formats time as HH:MM:SS', () => {
      const activities = [createActivity(1, 'Test')]

      const csv = exportToCSV(activities)

      // Time format is HH:MM:SS (timezone-dependent)
      expect(csv).toMatch(/\d{2}:\d{2}:\d{2}/)
    })

    it('formats confidence as decimal', () => {
      const activities = [createActivity(1, 'Test')]

      const csv = exportToCSV(activities)

      expect(csv).toContain('0.90')
    })

    it('handles empty activities array', () => {
      const csv = exportToCSV([])
      const lines = csv.split('\n')

      expect(lines).toHaveLength(1) // Just header
    })

    it('truncates long messages', () => {
      const longMessage = 'A'.repeat(600)
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Test'),
        originalMessage: longMessage
      }

      const csv = exportToCSV([activity])

      // Message should be truncated to 500 chars
      expect(csv.length).toBeLessThan(longMessage.length + 200)
    })

    it('replaces newlines in original message', () => {
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Test'),
        originalMessage: 'Line 1\nLine 2\nLine 3'
      }

      const csv = exportToCSV([activity])

      // Newlines should be replaced with spaces in the original message column
      expect(csv).toContain('Line 1 Line 2 Line 3')
    })
  })
})
