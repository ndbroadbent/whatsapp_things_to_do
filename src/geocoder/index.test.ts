import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassifiedSuggestion, GeocodedSuggestion } from '../types.js'

// Mock httpFetch before importing - explicitly re-export other functions
const mockFetch = vi.fn()
vi.mock('../http.js', () => ({
  httpFetch: mockFetch,
  // Re-implement the helper functions to avoid vi.importActual
  handleHttpError: async (response: {
    status: number
    text: () => Promise<string>
    headers: { get: (name: string) => string | null }
  }) => {
    const errorText = await response.text()
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after')
      return {
        ok: false,
        error: {
          type: 'rate_limit',
          message: `Rate limited: ${errorText}`,
          retryAfter: retryAfter ? Number.parseInt(retryAfter, 10) : undefined
        }
      }
    }
    if (response.status === 401) {
      return { ok: false, error: { type: 'auth', message: `Authentication failed: ${errorText}` } }
    }
    return {
      ok: false,
      error: { type: 'network', message: `API error ${response.status}: ${errorText}` }
    }
  },
  handleNetworkError: (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: { type: 'network', message: `Network error: ${message}` } }
  },
  emptyResponseError: () => ({
    ok: false,
    error: { type: 'invalid_response', message: 'Empty response from API' }
  })
}))

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

function createSuggestion(
  id: number,
  activity: string,
  location?: string,
  originalMessage?: string
): ClassifiedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    location,
    activityScore: 0.8,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: originalMessage ?? activity,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    isMappable: location !== undefined
  }
}

describe('Geocoder Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('geocodeLocation', async () => {
    const { geocodeLocation } = await import('./index.js')

    it('calls Google Geocoding API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5)
      })

      await geocodeLocation('Rome, Italy', { apiKey: 'test-key' })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://maps.googleapis.com/maps/api/geocode/json')
      )
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('key=test-key'))
    })

    it('returns coordinates on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9028, 12.4964, 'Rome, Italy')
      })

      const result = await geocodeLocation('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.latitude).toBeCloseTo(41.9028, 2)
        expect(result.value.longitude).toBeCloseTo(12.4964, 2)
        expect(result.value.formattedAddress).toBe('Rome, Italy')
      }
    })

    it('adds default country to query', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5)
      })

      await geocodeLocation('Rome', { apiKey: 'test-key', defaultCountry: 'Italy' })

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('Rome%2C+Italy'))
    })

    it('skips country suffix if already present', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5)
      })

      await geocodeLocation('Rome, Italy', { apiKey: 'test-key', defaultCountry: 'Italy' })

      // Should not add Italy twice
      const call = mockFetch.mock.calls[0] as [string]
      const url = call[0]
      const matches = url.match(/Italy/gi)
      expect(matches?.length).toBe(1)
    })

    it('adds region bias when specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5)
      })

      await geocodeLocation('Rome', { apiKey: 'test-key', regionBias: 'IT' })

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('region=it'))
    })

    it('handles ZERO_RESULTS status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(0, 0, '', 'ZERO_RESULTS')
      })

      const result = await geocodeLocation('NonexistentPlace12345', { apiKey: 'test-key' })

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

      const result = await geocodeLocation('Rome', { apiKey: 'test-key' })

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

      const result = await geocodeLocation('Rome', { apiKey: 'invalid' })

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

      const result = await geocodeLocation('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'))

      const result = await geocodeLocation('Rome', { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })
  })

  describe('geocodeSuggestions', async () => {
    const { geocodeSuggestions } = await import('./index.js')

    it('geocodes suggestions with location', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5, 'Rome, Italy')
      })

      const suggestions = [createSuggestion(1, 'Italian Restaurant', 'Rome')]

      const results = await geocodeSuggestions(suggestions, { apiKey: 'test-key' })

      expect(results).toHaveLength(1)
      expect(results[0]?.latitude).toBeCloseTo(41.9, 2)
      expect(results[0]?.longitude).toBeCloseTo(12.5, 2)
    })

    it('extracts coordinates from Google Maps URL', async () => {
      const suggestion = createSuggestion(
        1,
        'Great Restaurant',
        undefined,
        'Check this out! https://maps.google.com/maps?q=41.9028,12.4964'
      )

      const results = await geocodeSuggestions([suggestion], { apiKey: 'test-key' })

      expect(results[0]?.latitude).toBeCloseTo(41.9028, 2)
      expect(results[0]?.longitude).toBeCloseTo(12.4964, 2)
      expect(results[0]?.geocodeSource).toBe('google_maps_url')
      // Should not call the API since we got coords from URL
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('handles goo.gl/maps URLs', async () => {
      const suggestion = createSuggestion(
        1,
        'Place',
        undefined,
        'https://goo.gl/maps/xyz?q=40.7,-74.0'
      )

      const results = await geocodeSuggestions([suggestion], { apiKey: 'test-key' })

      // Should attempt to extract from URL pattern
      expect(results).toHaveLength(1)
    })

    it('falls back to activity text when location fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createGeocodingResponse(0, 0, '', 'ZERO_RESULTS')
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createGeocodingResponse(48.8, 2.3, 'Paris, France')
        })

      const suggestion = createSuggestion(1, 'Eiffel Tower Paris', 'Some Unknown Place')

      const results = await geocodeSuggestions([suggestion], { apiKey: 'test-key' })

      expect(results[0]?.latitude).toBeCloseTo(48.8, 1)
      expect(results[0]?.geocodeSource).toBe('place_search')
    })

    it('returns suggestion without coordinates when all geocoding fails', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(0, 0, '', 'ZERO_RESULTS')
      })

      const suggestion = createSuggestion(1, 'Unknown', 'Unknown Location')

      const results = await geocodeSuggestions([suggestion], { apiKey: 'test-key' })

      expect(results).toHaveLength(1)
      expect(results[0]?.latitude).toBeUndefined()
      expect(results[0]?.longitude).toBeUndefined()
    })

    it('handles suggestions without location', async () => {
      const suggestion = createSuggestion(1, 'Some activity')

      const results = await geocodeSuggestions([suggestion], { apiKey: 'test-key' })

      expect(results).toHaveLength(1)
      expect(results[0]?.latitude).toBeUndefined()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('processes multiple suggestions', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createGeocodingResponse(41.9, 12.5)
      })

      const suggestions = [
        createSuggestion(1, 'Place One', 'Rome'),
        createSuggestion(2, 'Place Two', 'Paris'),
        createSuggestion(3, 'Place Three', 'London')
      ]

      const results = await geocodeSuggestions(suggestions, { apiKey: 'test-key' })

      expect(results).toHaveLength(3)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('countGeocoded', async () => {
    const { countGeocoded } = await import('./index.js')

    it('counts suggestions with coordinates', () => {
      const suggestions: GeocodedSuggestion[] = [
        { ...createSuggestion(1, 'With coords'), latitude: 41.9, longitude: 12.5 },
        { ...createSuggestion(2, 'Without coords') },
        { ...createSuggestion(3, 'With coords'), latitude: 48.8, longitude: 2.3 }
      ]

      const count = countGeocoded(suggestions)

      expect(count).toBe(2)
    })

    it('returns 0 for empty array', () => {
      expect(countGeocoded([])).toBe(0)
    })
  })

  describe('filterGeocoded', async () => {
    const { filterGeocoded } = await import('./index.js')

    it('filters to only geocoded suggestions', () => {
      const suggestions: GeocodedSuggestion[] = [
        { ...createSuggestion(1, 'With coords'), latitude: 41.9, longitude: 12.5 },
        { ...createSuggestion(2, 'Without coords') },
        { ...createSuggestion(3, 'With coords'), latitude: 48.8, longitude: 2.3 }
      ]

      const filtered = filterGeocoded(suggestions)

      expect(filtered).toHaveLength(2)
      expect(filtered.every((s) => s.latitude !== undefined && s.longitude !== undefined)).toBe(
        true
      )
    })
  })

  describe('calculateCenter', async () => {
    const { calculateCenter } = await import('./index.js')

    it('calculates center point of geocoded suggestions', () => {
      const suggestions: GeocodedSuggestion[] = [
        { ...createSuggestion(1, 'A'), latitude: 40, longitude: 10 },
        { ...createSuggestion(2, 'B'), latitude: 42, longitude: 12 }
      ]

      const center = calculateCenter(suggestions)

      expect(center).not.toBeNull()
      expect(center?.lat).toBeCloseTo(41, 0)
      expect(center?.lng).toBeCloseTo(11, 0)
    })

    it('returns null for empty array', () => {
      expect(calculateCenter([])).toBeNull()
    })

    it('returns null when no suggestions are geocoded', () => {
      const suggestions: GeocodedSuggestion[] = [
        { ...createSuggestion(1, 'A') },
        { ...createSuggestion(2, 'B') }
      ]

      expect(calculateCenter(suggestions)).toBeNull()
    })

    it('handles single geocoded suggestion', () => {
      const suggestions: GeocodedSuggestion[] = [
        { ...createSuggestion(1, 'A'), latitude: 41.9, longitude: 12.5 }
      ]

      const center = calculateCenter(suggestions)

      expect(center?.lat).toBeCloseTo(41.9, 2)
      expect(center?.lng).toBeCloseTo(12.5, 2)
    })
  })
})
