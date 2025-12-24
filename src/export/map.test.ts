import { describe, expect, it } from 'vitest'
import { createGeocodedActivity as createTestGeo } from '../test-support'
import type { GeocodedActivity } from '../types'
import { exportToMapHTML } from './map-html'

function createActivity(
  id: number,
  activity: string,
  lat?: number,
  lng?: number
): GeocodedActivity {
  return createTestGeo({
    messageId: id,
    activity,
    category: 'food',
    confidence: 0.9,
    originalMessage: 'Original message',
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00'),
    latitude: lat,
    longitude: lng,
    city: lat ? 'Test Location' : null
  })
}

describe('Map HTML Export', () => {
  describe('exportToMapHTML', () => {
    it('returns valid HTML document', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('<html')
      expect(html).toContain('</html>')
    })

    it('includes Leaflet CSS and JS', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('leaflet.css')
      expect(html).toContain('leaflet')
    })

    it('includes title in document', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities, { title: 'My Custom Map' })

      expect(html).toContain('My Custom Map')
    })

    it('uses default title when not provided', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('Things To Do')
    })

    it('adds markers for geocoded activities', () => {
      const activities = [
        createActivity(1, 'Place One', 41.9, 12.5),
        createActivity(2, 'Place Two', 40.7, -74.0)
      ]

      const html = exportToMapHTML(activities)

      expect(html).toContain('41.9')
      expect(html).toContain('12.5')
      expect(html).toContain('40.7')
      expect(html).toContain('-74')
    })

    it('includes activity name in marker popup', () => {
      const activities = [createActivity(1, 'Amazing Italian Restaurant', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('Amazing Italian Restaurant')
    })

    it('sets map bounds to fit all markers', () => {
      const activities = [
        createActivity(1, 'Test', 41.9, 12.5),
        createActivity(2, 'Test', 40.7, -74.0)
      ]

      const html = exportToMapHTML(activities)

      expect(html).toContain('fitBounds')
    })

    it('handles single marker', () => {
      const activities = [createActivity(1, 'Only Place', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('Only Place')
      expect(html).toContain('L.marker')
    })

    it('includes location in popup', () => {
      const activity: GeocodedActivity = {
        ...createActivity(1, 'Restaurant', 41.9, 12.5),
        city: 'Rome',
        country: 'Italy'
      }

      const html = exportToMapHTML([activity])

      expect(html).toContain('Rome')
      expect(html).toContain('Italy')
    })

    it('uses OpenStreetMap tiles', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('openstreetmap')
    })

    it('creates a self-contained HTML file', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('<style')
      expect(html).toContain('<script')
    })

    it('includes marker clustering library', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('markercluster')
    })

    it('creates legend with sender colors', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('legend')
    })

    it('includes info box', () => {
      const activities = [createActivity(1, 'Test', 41.9, 12.5)]

      const html = exportToMapHTML(activities)

      expect(html).toContain('info-box')
    })
  })
})
