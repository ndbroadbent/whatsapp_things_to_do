import { describe, expect, it } from 'vitest'
import type { GeocodedSuggestion } from '../types.js'
import { exportToMapHTML } from './map-html.js'

function createSuggestion(
  id: number,
  activity: string,
  lat?: number,
  lng?: number
): GeocodedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    location: lat ? 'Test Location' : undefined,
    activityScore: 0.8,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00'),
    latitude: lat,
    longitude: lng,
    isMappable: lat !== undefined
  }
}

describe('Map HTML Export', () => {
  describe('exportToMapHTML', () => {
    it('returns valid HTML document', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html')
      expect(html).toContain('</html>')
    })

    it('includes Leaflet CSS and JS', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('leaflet.css')
      expect(html).toContain('leaflet.js')
    })

    it('includes title in document', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions, { title: 'My Custom Map' })

      expect(html).toContain('My Custom Map')
    })

    it('uses default title when not provided', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('Things To Do')
    })

    it('adds markers for geocoded suggestions', () => {
      const suggestions = [
        createSuggestion(1, 'Place One', 41.9, 12.5),
        createSuggestion(2, 'Place Two', 40.7, -74.0)
      ]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('41.9')
      expect(html).toContain('12.5')
      expect(html).toContain('40.7')
      expect(html).toContain('-74')
    })

    it('includes activity name in marker popup', () => {
      const suggestions = [createSuggestion(1, 'Amazing Italian Restaurant', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('Amazing Italian Restaurant')
    })

    it('sets map bounds to fit all markers', () => {
      const suggestions = [
        createSuggestion(1, 'Test', 41.9, 12.5),
        createSuggestion(2, 'Test', 40.7, -74.0)
      ]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('fitBounds')
    })

    it('handles single marker', () => {
      const suggestions = [createSuggestion(1, 'Only Place', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('Only Place')
      expect(html).toContain('L.marker')
    })

    it('includes location in popup', () => {
      const suggestion: GeocodedSuggestion = {
        ...createSuggestion(1, 'Restaurant', 41.9, 12.5),
        location: 'Rome, Italy'
      }

      const html = exportToMapHTML([suggestion])

      expect(html).toContain('Rome, Italy')
    })

    it('uses OpenStreetMap tiles', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('openstreetmap')
    })

    it('creates a self-contained HTML file', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('<style')
      expect(html).toContain('<script')
    })

    it('includes marker clustering library', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('markercluster')
    })

    it('creates legend with sender colors', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('legend')
    })

    it('includes info box', () => {
      const suggestions = [createSuggestion(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(suggestions)

      expect(html).toContain('info-box')
    })
  })
})
