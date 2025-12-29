/**
 * Cache Integration Tests
 *
 * Verify that cache hits prevent duplicate API calls across classifier,
 * embeddings, and geocoder modules.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivity } from '../test-support'
import type { CandidateMessage, ClassifiedActivity, GeocoderConfig } from '../types'
import { FilesystemCache } from './filesystem'

// Base config with required fields for all tests
const BASE_CONFIG = {
  homeCountry: 'New Zealand',
  timezone: 'Pacific/Auckland'
} as const

// Mock the http module to track API calls
const mockFetch = vi.fn()
vi.mock('../http', () => ({
  httpFetch: mockFetch,
  handleHttpError: async (response: { status: number; text: () => Promise<string> }) => {
    const errorText = await response.text()
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

function createCandidate(id: number, content: string): CandidateMessage {
  return {
    messageId: id,
    content,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    candidateType: 'suggestion',
    contextBefore: [],
    contextAfter: []
  }
}

function createClassifiedActivity(id: number, activity: string, city: string): ClassifiedActivity {
  return createActivity({
    activity,
    category: 'food',
    messages: [
      {
        id,
        sender: 'Test User',
        timestamp: new Date('2025-01-15T10:30:00Z'),
        message: `Lets go to ${city}`
      }
    ],
    city
  })
}

describe('Cache Integration', () => {
  let testDir: string
  let cache: FilesystemCache

  beforeEach(() => {
    testDir = join(tmpdir(), `cache-integ-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    cache = new FilesystemCache(testDir)
    vi.clearAllMocks()
  })

  afterEach(async () => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
    await cache.clear()
  })

  describe('classifyMessages cache integration', () => {
    it('calls API on cache miss', async () => {
      const { classifyMessages } = await import('../classifier/index')

      const candidates = [createCandidate(1, 'We should try that new Italian restaurant!')]

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  msg: 1,
                  is_act: true,
                  title: 'Try the new Italian restaurant',
                  score: 0.9,
                  cat: 'restaurant',
                  conf: 0.9,
                  gen: true,
                  com: true,
                  act: null,
                  act_orig: null,
                  obj: null,
                  obj_orig: null,
                  venue: null,
                  city: 'downtown',
                  region: null,
                  country: null
                }
              ])
            }
          ],
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      })

      const result = await classifyMessages(
        candidates,
        { ...BASE_CONFIG, provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips API call on cache hit', async () => {
      const { classifyMessages } = await import('../classifier/index')

      const candidates = [createCandidate(1, 'We should try that new Italian restaurant!')]

      // Mock successful API response for first call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  msg: 1,
                  is_act: true,
                  title: 'Try the new Italian restaurant',
                  score: 0.9,
                  cat: 'restaurant',
                  conf: 0.9,
                  gen: true,
                  com: true,
                  act: null,
                  act_orig: null,
                  obj: null,
                  obj_orig: null,
                  venue: null,
                  city: 'downtown',
                  region: null,
                  country: null
                }
              ])
            }
          ],
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      })

      // First call - should hit API
      const result1 = await classifyMessages(
        candidates,
        { ...BASE_CONFIG, provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      expect(result1.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call with same candidates - should use cache
      const result2 = await classifyMessages(
        candidates,
        { ...BASE_CONFIG, provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      expect(result2.ok).toBe(true)
      // Should still only have 1 API call
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Results should have same content (timestamps may differ due to JSON serialization)
      if (result1.ok && result2.ok) {
        expect(result2.value).toHaveLength(result1.value.length)
        expect(result2.value[0]?.activity).toBe(result1.value[0]?.activity)
        expect(result2.value[0]?.city).toBe(result1.value[0]?.city)
      }
    })

    it('makes new API call for different candidates', async () => {
      const { classifyMessages } = await import('../classifier/index')

      // Mock successful API response
      const createMockResponse = (id: number) => ({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  msg: id,
                  is_act: true,
                  title: `Activity ${id}`,
                  score: 0.9,
                  cat: 'restaurant',
                  conf: 0.9,
                  gen: true,
                  com: true,
                  act: null,
                  act_orig: null,
                  obj: null,
                  obj_orig: null,
                  venue: null,
                  city: 'somewhere',
                  region: null,
                  country: null
                }
              ])
            }
          ],
          usage: { input_tokens: 100, output_tokens: 50 }
        })
      })

      mockFetch.mockResolvedValueOnce(createMockResponse(1))
      mockFetch.mockResolvedValueOnce(createMockResponse(2))

      // First call with candidate 1
      await classifyMessages(
        [createCandidate(1, 'Lets try the Italian place')],
        { ...BASE_CONFIG, provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      // Second call with different candidate
      await classifyMessages(
        [createCandidate(2, 'Lets go hiking this weekend!')],
        { ...BASE_CONFIG, provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      // Both should make API calls
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('messageEmbeddings cache integration', () => {
    const messages = [{ id: 1, content: 'Test message for embedding that is long enough' }]

    it('calls API on cache miss', async () => {
      const { messageEmbeddings } = await import('../extraction/embeddings/index')

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { prompt_tokens: 10, total_tokens: 10 }
        })
      })

      const result = await messageEmbeddings(messages, { apiKey: 'test-key' }, cache)

      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips API call on cache hit', async () => {
      const { messageEmbeddings } = await import('../extraction/embeddings/index')

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { prompt_tokens: 10, total_tokens: 10 }
        })
      })

      // First call - should hit API
      await messageEmbeddings(messages, { apiKey: 'test-key' }, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await messageEmbeddings(messages, { apiKey: 'test-key' }, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('geocodeActivities cache integration', () => {
    const config: GeocoderConfig = {
      apiKey: 'test-key',
      regionBias: 'NZ'
    }

    it('calls API on cache miss', async () => {
      const { geocodeActivities } = await import('../geocoder/index')

      const suggestions = [createClassifiedActivity(1, 'Try the cafe', 'Cuba Street, Wellington')]

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'Cuba Street, Wellington 6011, New Zealand',
              geometry: { location: { lat: -41.2923, lng: 174.7787 } }
            }
          ],
          status: 'OK'
        })
      })

      const result = await geocodeActivities(suggestions, config, cache)

      expect(result).toHaveLength(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips API call on cache hit', async () => {
      const { geocodeActivities } = await import('../geocoder/index')

      const suggestions = [createClassifiedActivity(1, 'Try the cafe', 'Cuba Street, Wellington')]

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'Cuba Street, Wellington 6011, New Zealand',
              geometry: { location: { lat: -41.2923, lng: 174.7787 } }
            }
          ],
          status: 'OK'
        })
      })

      // First call - should hit API
      await geocodeActivities(suggestions, config, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await geocodeActivities(suggestions, config, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('makes new API call for different locations', async () => {
      const { geocodeActivities } = await import('../geocoder/index')

      // Mock successful API responses
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'Cuba Street, Wellington 6011, New Zealand',
              geometry: { location: { lat: -41.2923, lng: 174.7787 } }
            }
          ],
          status: 'OK'
        })
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: 'Queenstown, New Zealand',
              geometry: { location: { lat: -45.0312, lng: 168.6626 } }
            }
          ],
          status: 'OK'
        })
      })

      // First call
      await geocodeActivities(
        [createClassifiedActivity(1, 'Try the cafe', 'Cuba Street, Wellington')],
        config,
        cache
      )

      // Second call with different location
      await geocodeActivities(
        [createClassifiedActivity(2, 'Visit Queenstown', 'Queenstown, New Zealand')],
        config,
        cache
      )

      // Both should make API calls
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
