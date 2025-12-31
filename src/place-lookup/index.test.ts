import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createActivity as createTestActivity,
  createGeocodedActivity as createTestGeo
} from '../test-support'
import type { ClassifiedActivity, GeocodedActivity } from '../types'

// Mock guardedFetch before importing
const mockFetch = vi.fn()
vi.mock('../http', () => ({
  guardedFetch: mockFetch,
  httpFetch: mockFetch,
  HttpResponse: {} // Type export - not used at runtime
}))

/**
 * Create a Places API Text Search response (for lookupPlace / searchPlace)
 */
function createPlacesResponse(
  lat: number,
  lng: number,
  address = 'Test Address',
  name = 'Test Place',
  status = 'OK'
): {
  status: string
  results: Array<{
    geometry: { location: { lat: number; lng: number } }
    formatted_address: string
    place_id: string
    name: string
  }>
} {
  return {
    status,
    results:
      status === 'OK'
        ? [
            {
              geometry: { location: { lat, lng } },
              formatted_address: address,
              place_id: 'test-place-id',
              name
            }
          ]
        : []
  }
}

/**
 * Create a Geocoding API response (for geocodeAddress)
 */
function createGeocodingResponse(
  lat: number,
  lng: number,
  address = 'Test Address',
  status = 'OK'
): {
  status: string
  results: Array<{
    geometry: { location: { lat: number; lng: number } }
    formatted_address: string
    place_id: string
  }>
} {
  return {
    status,
    results:
      status === 'OK'
        ? [
            {
              geometry: { location: { lat, lng } },
              formatted_address: address,
              place_id: 'test-place-id'
            }
          ]
        : []
  }
}

function createActivity(
  id: number,
  activity: string,
  city?: string,
  originalMessage?: string
): ClassifiedActivity {
  return createTestActivity({
    activity,
    category: 'food',
    score: 0.9,
    messages: [
      {
        id,
        sender: 'Test User',
        timestamp: new Date('2025-01-15T10:30:00Z'),
        message: originalMessage ?? activity
      }
    ],
    city: city ?? null
  })
}

describe('Geocoder Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('lookupPlace', async () => {
    // lookupPlace uses Places API Text Search (not Geocoding API)
    const { lookupPlace } = await import('./index')

    it('calls Google Places Text Search API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createPlacesResponse(41.9, 12.5, 'Rome, Italy', 'Rome')
      })

      await lookupPlace('Rome, Italy', { apiKey: 'test-key' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://maps.googleapis.com/maps/api/place/textsearch/json')
      )
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('key=test-key'))
    })

    it('returns coordinates on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createPlacesResponse(41.9028, 12.4964, 'Rome, Italy', 'Rome')
      })

      const result = await lookupPlace('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.latitude).toBeCloseTo(41.9028, 2)
        expect(result.value.longitude).toBeCloseTo(12.4964, 2)
        expect(result.value.formattedAddress).toBe('Rome, Italy')
        expect(result.value.name).toBe('Rome')
      }
    })

    it('adds region bias for default country', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createPlacesResponse(41.9, 12.5, 'Rome, Italy', 'Rome')
      })

      await lookupPlace('Rome', { apiKey: 'test-key', defaultCountry: 'Italy' })

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('region=it'))
    })

    it('adds region bias when specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createPlacesResponse(41.9, 12.5, 'Rome, Italy', 'Rome')
      })

      await lookupPlace('Rome', { apiKey: 'test-key', regionBias: 'IT' })

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('region=it'))
    })

    it('handles ZERO_RESULTS status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createPlacesResponse(0, 0, '', '', 'ZERO_RESULTS')
      })

      const result = await lookupPlace('NonexistentPlace12345', { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('invalid_response')
        expect(result.error.message).toContain('No results')
      }
    })

    it('handles OVER_QUERY_LIMIT status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'OVER_QUERY_LIMIT', results: [] })
      })

      const result = await lookupPlace('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('quota')
      }
    })

    it('handles REQUEST_DENIED status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'REQUEST_DENIED',
          results: [],
          error_message: 'API key invalid'
        })
      })

      const result = await lookupPlace('Rome', { apiKey: 'invalid' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('auth')
      }
    })

    it('handles HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error'
      })

      const result = await lookupPlace('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'))

      const result = await lookupPlace('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })
  })

  describe('lookupActivityPlaces', async () => {
    // Activities without venue use Geocoding API
    // Activities with venue use Places API Text Search
    const { lookupActivityPlaces } = await import('./index')

    it('geocodes activities with city using Geocoding API', async () => {
      // Activities with city but no venue use Geocoding API
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5, 'Rome, Italy')
      })

      const activities = [createActivity(1, 'Italian Restaurant', 'Rome')]

      const results = await lookupActivityPlaces(activities, { apiKey: 'test-key' })

      expect(results).toHaveLength(1)
      expect(results[0]?.latitude).toBeCloseTo(41.9, 2)
      expect(results[0]?.longitude).toBeCloseTo(12.5, 2)
      expect(results[0]?.placeLookupSource).toBe('geocoding_api')
    })

    it('extracts coordinates from Google Maps URL', async () => {
      const activity = createActivity(
        1,
        'Great Restaurant',
        undefined,
        'Check this out! https://maps.google.com/maps?q=41.9028,12.4964'
      )

      const results = await lookupActivityPlaces([activity], { apiKey: 'test-key' })

      expect(results[0]?.latitude).toBeCloseTo(41.9028, 2)
      expect(results[0]?.longitude).toBeCloseTo(12.4964, 2)
      expect(results[0]?.placeLookupSource).toBe('google_maps_url')
      // Should not call the API since we got coords from URL
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('handles goo.gl/maps URLs', async () => {
      const activity = createActivity(1, 'Place', undefined, 'https://goo.gl/maps/xyz?q=40.7,-74.0')

      const results = await lookupActivityPlaces([activity], { apiKey: 'test-key' })

      // Should attempt to extract from URL pattern
      expect(results).toHaveLength(1)
    })

    it('falls back to activity text when location fails', async () => {
      // First call: Geocoding API fails (ZERO_RESULTS)
      // Second call: Places API Text Search on activity text succeeds
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createGeocodingResponse(0, 0, '', 'ZERO_RESULTS')
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () =>
            createPlacesResponse(48.8, 2.3, 'Eiffel Tower, Paris, France', 'Eiffel Tower')
        })

      const activity = createActivity(1, 'Eiffel Tower Paris', 'Some Unknown Place')

      const results = await lookupActivityPlaces([activity], { apiKey: 'test-key' })

      expect(results[0]?.latitude).toBeCloseTo(48.8, 1)
      expect(results[0]?.placeLookupSource).toBe('places_api')
    })

    it('returns activity without coordinates when all geocoding fails', async () => {
      // Both Geocoding and Places API fail
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ZERO_RESULTS', results: [] })
      })

      const activity = createActivity(1, 'Unknown', 'Unknown Location')

      const results = await lookupActivityPlaces([activity], { apiKey: 'test-key' })

      expect(results).toHaveLength(1)
      expect(results[0]?.latitude).toBeUndefined()
      expect(results[0]?.longitude).toBeUndefined()
    })

    it('handles activities without location', async () => {
      const activity = createActivity(1, 'Some activity')

      const results = await lookupActivityPlaces([activity], { apiKey: 'test-key' })

      expect(results).toHaveLength(1)
      expect(results[0]?.latitude).toBeUndefined()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('processes multiple activities', async () => {
      // All activities use Geocoding API (they have city but no venue)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5)
      })

      const activities = [
        createActivity(1, 'Place One', 'Rome'),
        createActivity(2, 'Place Two', 'Paris'),
        createActivity(3, 'Place Three', 'London')
      ]

      const results = await lookupActivityPlaces(activities, { apiKey: 'test-key' })

      expect(results).toHaveLength(3)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('countWithCoordinates', async () => {
    const { countWithCoordinates } = await import('./index')

    it('counts activities with coordinates', () => {
      const activities: GeocodedActivity[] = [
        createTestGeo({ activity: 'Place 1', latitude: 41.9, longitude: 12.5 }),
        createTestGeo({ activity: 'Place 2', latitude: 40.7, longitude: -74.0 }),
        createTestGeo({ activity: 'No coords' })
      ]

      const count = countWithCoordinates(activities)

      expect(count).toBe(2)
    })

    it('returns 0 for empty array', () => {
      expect(countWithCoordinates([])).toBe(0)
    })
  })

  describe('filterWithCoordinates', async () => {
    const { filterWithCoordinates } = await import('./index')

    it('filters to only geocoded activities', () => {
      const activities: GeocodedActivity[] = [
        createTestGeo({ activity: 'Place 1', latitude: 41.9, longitude: 12.5 }),
        createTestGeo({ activity: 'Place 2', latitude: 40.7, longitude: -74.0 }),
        createTestGeo({ activity: 'No coords' })
      ]

      const filtered = filterWithCoordinates(activities)

      expect(filtered).toHaveLength(2)
      expect(filtered.every((s) => s.latitude !== undefined && s.longitude !== undefined)).toBe(
        true
      )
    })
  })

  describe('calculateCenter', async () => {
    const { calculateCenter } = await import('./index')

    it('calculates center point of geocoded activities', () => {
      const activities: GeocodedActivity[] = [
        createTestGeo({ activity: 'Place 1', latitude: 40.0, longitude: 10.0 }),
        createTestGeo({ activity: 'Place 2', latitude: 42.0, longitude: 12.0 })
      ]

      const center = calculateCenter(activities)

      expect(center).not.toBeNull()
      expect(center?.lat).toBeCloseTo(41, 0)
      expect(center?.lng).toBeCloseTo(11, 0)
    })

    it('returns null for empty array', () => {
      expect(calculateCenter([])).toBeNull()
    })

    it('returns null when no activities are geocoded', () => {
      const activities: GeocodedActivity[] = [
        createTestGeo({ activity: 'No coords 1' }),
        createTestGeo({ activity: 'No coords 2' })
      ]

      expect(calculateCenter(activities)).toBeNull()
    })

    it('handles single geocoded activity', () => {
      const activities: GeocodedActivity[] = [
        createTestGeo({ activity: 'Single place', latitude: 41.9, longitude: 12.5 })
      ]

      const center = calculateCenter(activities)

      expect(center?.lat).toBeCloseTo(41.9, 2)
      expect(center?.lng).toBeCloseTo(12.5, 2)
    })
  })
})
