/**
 * Pexels Image Fetching Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CachedResponse, ResponseCache } from '../caching/types'
import { createGeocodedActivity } from '../test-support'
import type { GeocodedActivity } from '../types/place-lookup'

// Use vi.hoisted to create mock before module mocking
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('../http', () => ({
  httpFetch: mockFetch
}))

import { fetchPexelsImage } from './pexels'

function createMockCache(): ResponseCache {
  const store = new Map<string, CachedResponse<unknown>>()
  return {
    get: async <T = unknown>(key: string): Promise<CachedResponse<T> | null> => {
      const result = store.get(key)
      return (result as CachedResponse<T>) ?? null
    },
    set: async <T = unknown>(key: string, value: CachedResponse<T>): Promise<void> => {
      store.set(key, value as CachedResponse<unknown>)
    }
  }
}

function createMockActivity(overrides: Partial<GeocodedActivity> = {}): GeocodedActivity {
  return createGeocodedActivity({
    activity: 'Go hiking',
    score: 0.8,
    category: 'nature',
    image: { stock: 'hiking mountains nature', mediaKey: 'hiking', preferStock: true },
    ...overrides
  })
}

function createPexelsResponse(photos: unknown[] = []) {
  return {
    ok: true,
    json: async () => ({
      total_results: photos.length,
      page: 1,
      per_page: 3,
      photos
    })
  }
}

describe('Pexels Image Fetching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchPexelsImage', () => {
    it('returns null when no stock query available', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: '', mediaKey: null, preferStock: false },
        category: 'other',
        city: null,
        region: null,
        country: null
      })

      const result = await fetchPexelsImage(activity, 'test-api-key', cache)

      expect(result).toBeNull()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('makes API call with correct query from image.stock', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: 'hiking trail Auckland', mediaKey: 'hiking', preferStock: true },
        city: 'Auckland'
      })

      mockFetch.mockResolvedValueOnce(
        createPexelsResponse([
          {
            id: 123,
            width: 1920,
            height: 1080,
            url: 'https://www.pexels.com/photo/hiking-123',
            photographer: 'Test Photographer',
            photographer_url: 'https://www.pexels.com/@testphotographer',
            photographer_id: 456,
            avg_color: '#000000',
            src: {
              large: 'https://images.pexels.com/photos/123/large.jpg'
            },
            alt: 'Hiking trail'
          }
        ])
      )

      await fetchPexelsImage(activity, 'test-api-key', cache)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const [url, options] = mockFetch.mock.calls[0] ?? []
      expect(url).toContain('https://api.pexels.com/v1/search')
      expect(url).toContain('query=hiking+trail+Auckland')
      expect(url).toContain('orientation=landscape')
      expect(options?.headers).toEqual({ Authorization: 'test-api-key' })
    })

    it('returns image result with correct metadata', async () => {
      const cache = createMockCache()
      const activity = createMockActivity()

      mockFetch.mockResolvedValueOnce(
        createPexelsResponse([
          {
            id: 123,
            width: 1920,
            height: 1080,
            url: 'https://www.pexels.com/photo/hiking-123',
            photographer: 'Nature Lover',
            photographer_url: 'https://www.pexels.com/@naturelover',
            photographer_id: 789,
            avg_color: '#336633',
            src: {
              large: 'https://images.pexels.com/photos/123/large.jpg'
            },
            alt: 'Mountain hiking trail'
          }
        ])
      )

      const result = await fetchPexelsImage(activity, 'test-api-key', cache)

      expect(result).not.toBeNull()
      expect(result?.imageUrl).toBe('https://images.pexels.com/photos/123/large.jpg')
      expect(result?.meta.source).toBe('pexels')
      expect(result?.meta.url).toBe('https://www.pexels.com/photo/hiking-123')
      expect(result?.meta.license).toBe('Pexels License')
      expect(result?.meta.license_url).toBe('https://www.pexels.com/license/')
      expect(result?.meta.attribution?.name).toBe('Nature Lover')
      expect(result?.meta.attribution?.url).toBe('https://www.pexels.com/@naturelover')
    })

    it('returns null when API returns no results', async () => {
      const cache = createMockCache()
      const activity = createMockActivity()

      mockFetch.mockResolvedValueOnce(createPexelsResponse([]))

      const result = await fetchPexelsImage(activity, 'test-api-key', cache)

      expect(result).toBeNull()
    })

    it('returns null when API call fails', async () => {
      const cache = createMockCache()
      const activity = createMockActivity()

      mockFetch.mockResolvedValueOnce({ ok: false })

      const result = await fetchPexelsImage(activity, 'test-api-key', cache)

      expect(result).toBeNull()
    })

    it('returns cached result on subsequent calls', async () => {
      const cache = createMockCache()
      const activity = createMockActivity()

      mockFetch.mockResolvedValueOnce(
        createPexelsResponse([
          {
            id: 123,
            width: 1920,
            height: 1080,
            url: 'https://www.pexels.com/photo/hiking-123',
            photographer: 'Test',
            photographer_url: 'https://www.pexels.com/@test',
            photographer_id: 1,
            avg_color: '#000000',
            src: { large: 'https://images.pexels.com/photos/123/large.jpg' },
            alt: 'Test'
          }
        ])
      )

      // First call
      const result1 = await fetchPexelsImage(activity, 'test-api-key', cache)
      expect(result1).not.toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      const result2 = await fetchPexelsImage(activity, 'test-api-key', cache)
      expect(result2).not.toBeNull()
      expect(result2?.imageUrl).toBe(result1?.imageUrl)
      expect(mockFetch).toHaveBeenCalledTimes(1) // Still only 1 call
    })

    it('falls back to category when no stock query available', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: '', mediaKey: null, preferStock: false },
        placeName: null,
        placeQuery: null,
        city: null,
        region: null,
        country: null,
        category: 'food'
      })

      mockFetch.mockResolvedValueOnce(createPexelsResponse([]))

      await fetchPexelsImage(activity, 'test-api-key', cache)

      const [url] = mockFetch.mock.calls[0] ?? []
      expect(url).toContain('query=food')
    })
  })
})
