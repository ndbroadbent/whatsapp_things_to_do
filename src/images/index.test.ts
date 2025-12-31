/**
 * Images Module Tests
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { CachedResponse, ResponseCache } from '../caching/types'
import { createGeocodedActivity } from '../test-support'
import type { GeocodedActivity } from '../types/place-lookup'
import { clearMediaIndexCache, fetchImageForActivity, fetchImagesForActivities } from './index'
import type { ImageFetchConfig } from './types'

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
    activity: 'Visit the coffee shop',
    score: 0.8,
    category: 'food',
    ...overrides
  })
}

describe('Images Module', () => {
  beforeEach(() => {
    clearMediaIndexCache()
  })

  describe('fetchImageForActivity', () => {
    it('returns null when no sources available', async () => {
      const cache = createMockCache()
      const activity = createMockActivity()
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Google Places when skipGooglePlaces is true', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({ placeId: 'ChIJ123' })
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true,
        googlePlacesApiKey: 'test-key'
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Wikipedia when skipWikipedia is true', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({ placeName: 'Eiffel Tower', city: 'Paris' })
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Pexels when skipPexels is true', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: 'hiking mountains', mediaKey: 'hiking', preferStock: true }
      })
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true,
        pexelsApiKey: 'test-key'
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Pexels when no API key provided', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: 'hiking', mediaKey: 'hiking', preferStock: true }
      })
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPixabay: true,
        skipMediaLibrary: true
        // No pexelsApiKey
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Pixabay when skipPixabay is true', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: 'hiking mountains', mediaKey: 'hiking', preferStock: true }
      })
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true,
        pixabayApiKey: 'test-key'
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Pixabay when no API key provided', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({
        image: { stock: 'hiking mountains', mediaKey: 'hiking', preferStock: true }
      })
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipMediaLibrary: true
        // No pixabayApiKey
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })

    it('skips Google Places when no API key provided', async () => {
      const cache = createMockCache()
      const activity = createMockActivity({ placeId: 'ChIJ123' })
      const config: ImageFetchConfig = {
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true
        // No googlePlacesApiKey
      }

      const result = await fetchImageForActivity(activity, config, cache)

      expect(result).toBeNull()
    })
  })

  describe('fetchImagesForActivities', () => {
    it('returns a map with null values when no sources available', async () => {
      const cache = createMockCache()
      const activity1 = createMockActivity({ activity: 'Activity 1' })
      const activity2 = createMockActivity({ activity: 'Activity 2' })
      const activity3 = createMockActivity({ activity: 'Activity 3' })
      const activities = [activity1, activity2, activity3]
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true
      }

      const results = await fetchImagesForActivities(activities, config, cache)

      expect(results.size).toBe(3)
      expect(results.get(activity1.activityId)).toBeNull()
      expect(results.get(activity2.activityId)).toBeNull()
      expect(results.get(activity3.activityId)).toBeNull()
    })

    it('calls onProgress callback', async () => {
      const cache = createMockCache()
      const activities = [
        createMockActivity({ activity: 'Test 1' }),
        createMockActivity({ activity: 'Test 2' })
      ]
      const config: ImageFetchConfig = {
        skipGooglePlaces: true,
        skipWikipedia: true,
        skipPexels: true,
        skipPixabay: true,
        skipMediaLibrary: true
      }
      const progressCalls: Array<{ current: number; total: number }> = []

      await fetchImagesForActivities(activities, config, cache, {
        onProgress: (current, total) => {
          progressCalls.push({ current, total })
        }
      })

      expect(progressCalls).toHaveLength(2)
      expect(progressCalls[0]).toEqual({ current: 1, total: 2 })
      expect(progressCalls[1]).toEqual({ current: 2, total: 2 })
    })

    it('handles empty activities array', async () => {
      const cache = createMockCache()
      const config: ImageFetchConfig = {
        skipMediaLibrary: true
      }

      const results = await fetchImagesForActivities([], config, cache)

      expect(results.size).toBe(0)
    })
  })
})
