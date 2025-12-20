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
import type { CandidateMessage, ClassifiedSuggestion, GeocoderConfig } from '../types.js'
import { FilesystemCache } from './filesystem'

// Mock the http module to track API calls
const mockFetch = vi.fn()
vi.mock('../http.js', () => ({
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
    confidence: 0.8
  }
}

function createClassifiedSuggestion(
  id: number,
  activity: string,
  city: string
): ClassifiedSuggestion {
  return {
    messageId: id,
    isActivity: true,
    activity,
    activityScore: 0.9,
    category: 'restaurant',
    confidence: 0.9,
    originalMessage: `Lets go to ${city}`,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    isGeneric: true,
    isComplete: true,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city,
    state: null,
    country: null
  }
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
      const { classifyMessages } = await import('../classifier/index.js')

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
                  state: null,
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
        { provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips API call on cache hit', async () => {
      const { classifyMessages } = await import('../classifier/index.js')

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
                  state: null,
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
        { provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      expect(result1.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call with same candidates - should use cache
      const result2 = await classifyMessages(
        candidates,
        { provider: 'anthropic', apiKey: 'test-key' },
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
      const { classifyMessages } = await import('../classifier/index.js')

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
                  state: null,
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
        { provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      // Second call with different candidate
      await classifyMessages(
        [createCandidate(2, 'Lets go hiking this weekend!')],
        { provider: 'anthropic', apiKey: 'test-key' },
        cache
      )

      // Both should make API calls
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('embedMessages cache integration', () => {
    const messages = [{ id: 1, content: 'Test message for embedding that is long enough' }]

    it('calls API on cache miss', async () => {
      const { embedMessages } = await import('../embeddings/index.js')

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { prompt_tokens: 10, total_tokens: 10 }
        })
      })

      const result = await embedMessages(messages, { apiKey: 'test-key' }, cache)

      expect(result.ok).toBe(true)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips API call on cache hit', async () => {
      const { embedMessages } = await import('../embeddings/index.js')

      // Mock successful API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }],
          usage: { prompt_tokens: 10, total_tokens: 10 }
        })
      })

      // First call - should hit API
      await embedMessages(messages, { apiKey: 'test-key' }, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await embedMessages(messages, { apiKey: 'test-key' }, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('geocodeSuggestions cache integration', () => {
    const config: GeocoderConfig = {
      apiKey: 'test-key',
      regionBias: 'NZ'
    }

    it('calls API on cache miss', async () => {
      const { geocodeSuggestions } = await import('../geocoder/index.js')

      const suggestions = [createClassifiedSuggestion(1, 'Try the cafe', 'Cuba Street, Wellington')]

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

      const result = await geocodeSuggestions(suggestions, config, cache)

      expect(result).toHaveLength(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('skips API call on cache hit', async () => {
      const { geocodeSuggestions } = await import('../geocoder/index.js')

      const suggestions = [createClassifiedSuggestion(1, 'Try the cafe', 'Cuba Street, Wellington')]

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
      await geocodeSuggestions(suggestions, config, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await geocodeSuggestions(suggestions, config, cache)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('makes new API call for different locations', async () => {
      const { geocodeSuggestions } = await import('../geocoder/index.js')

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
      await geocodeSuggestions(
        [createClassifiedSuggestion(1, 'Try the cafe', 'Cuba Street, Wellington')],
        config,
        cache
      )

      // Second call with different location
      await geocodeSuggestions(
        [createClassifiedSuggestion(2, 'Visit Queenstown', 'Queenstown, New Zealand')],
        config,
        cache
      )

      // Both should make API calls
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })
})
