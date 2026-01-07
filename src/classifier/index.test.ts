import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivity as createTestActivity } from '../test-support'
import type { CandidateMessage } from '../types'

// Base config with required fields for all tests
const BASE_CONFIG = {
  homeCountry: 'New Zealand',
  timezone: 'Pacific/Auckland'
} as const

// Mock httpFetch before importing - explicitly re-export other functions
const mockFetch = vi.fn()
vi.mock('../http', () => ({
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
      return {
        ok: false,
        error: { type: 'auth', message: `Authentication failed: ${errorText}` }
      }
    }
    return {
      ok: false,
      error: {
        type: 'network',
        message: `API error ${response.status}: ${errorText}`
      }
    }
  },
  handleNetworkError: (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: { type: 'network', message: `Network error: ${message}` }
    }
  },
  emptyResponseError: () => ({
    ok: false,
    error: { type: 'invalid_response', message: 'Empty response from API' }
  })
}))

function createCandidate(id: number, content: string, sender = 'Test User'): CandidateMessage {
  return {
    messageId: id,
    content,
    sender,
    timestamp: new Date('2025-01-15T10:30:00Z'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    candidateType: 'suggestion',
    contextBefore: [],
    contextAfter: []
  }
}

function createMockClassifierResponse(
  items: Array<{
    message_id: number
    activity: string
    category: string
    confidence: number
    city?: string
    country?: string
    action?: string
  }>
): string {
  // Convert to new schema format
  return JSON.stringify(
    items.map((item) => ({
      msg: item.message_id,
      title: item.activity,
      fun: 0.7,
      int: 0.5,
      cat: item.category,
      conf: item.confidence,
      gen: false,
      com: false,
      act: item.action ?? 'try',
      act_orig: item.action ?? 'try',
      obj: null,
      obj_orig: null,
      venue: null,
      city: item.city ?? null,
      region: null,
      country: item.country ?? null,
      kw: []
    }))
  )
}

describe('Classifier Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('classifyMessages', async () => {
    const { classifyMessages } = await import('./index')

    it('calls Anthropic API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: createMockClassifierResponse([
                {
                  message_id: 1,

                  activity: 'Test',
                  category: 'food',
                  confidence: 0.9
                }
              ])
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'We should try this restaurant')]

      await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'test-key',
            'anthropic-version': '2023-06-01'
          })
        })
      )
    })

    it('calls OpenAI API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: createMockClassifierResponse([
                  {
                    message_id: 1,

                    activity: 'Test',
                    category: 'food',
                    confidence: 0.9
                  }
                ])
              }
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'We should try this restaurant')]

      await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'openai',
        apiKey: 'test-key'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key'
          })
        })
      )
    })

    it('calls OpenRouter API with correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: createMockClassifierResponse([
                  {
                    message_id: 1,

                    activity: 'Test',
                    category: 'food',
                    confidence: 0.9
                  }
                ])
              }
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'We should try this restaurant')]

      await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'openrouter',
        apiKey: 'test-key'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.anything()
      )
    })

    it('returns classified suggestions on success', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: createMockClassifierResponse([
                {
                  message_id: 1,

                  activity: 'Italian Restaurant',
                  category: 'food',
                  confidence: 0.95,
                  city: 'Rome',
                  country: 'Italy'
                }
              ])
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'We should try this Italian restaurant')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.activities).toHaveLength(1)
        expect(result.value.activities[0]?.activity).toBe('Italian Restaurant')
        expect(result.value.activities[0]?.category).toBe('food')
      }
    })

    it('handles HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
        headers: { get: () => null }
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'invalid-key'
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('auth')
      }
    })

    it('handles rate limiting', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
        headers: {
          get: (name: string) => (name === 'retry-after' ? '60' : null)
        }
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('rate_limit')
        expect(result.error.retryAfter).toBe(60)
      }
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })

    it('handles empty API response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ content: [] })
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('invalid_response')
      }
    })

    it('processes candidates in batches', async () => {
      // Mock returns responses for all 25 IDs - each batch finds its matching IDs
      const allResponses = Array.from({ length: 25 }, (_, i) => ({
        message_id: i + 1,

        activity: 'Test',
        category: 'food',
        confidence: 0.9
      }))

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: createMockClassifierResponse(allResponses)
            }
          ]
        })
      })

      const candidates = Array.from({ length: 25 }, (_, i) =>
        createCandidate(i + 1, `Message ${i + 1}`)
      )

      await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key',
        batchSize: 10
      })

      // Should make 3 API calls (10 + 10 + 5)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('normalizes category to valid values', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: createMockClassifierResponse([
                {
                  message_id: 1,

                  activity: 'Test',
                  category: 'INVALID_CATEGORY',
                  confidence: 0.9
                }
              ])
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.activities[0]?.category).toBe('other')
      }
    })

    it('uses custom model when specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: createMockClassifierResponse([
                {
                  message_id: 1,

                  activity: 'Test',
                  category: 'food',
                  confidence: 0.9
                }
              ])
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'Test')]

      await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-opus-20240229'
      })

      const call = mockFetch.mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(call[1].body) as { model: string }
      expect(body.model).toBe('claude-3-opus-20240229')
    })

    it('returns error for unknown provider', async () => {
      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'unknown' as 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toContain('Unknown provider')
      }
    })

    it('falls back to secondary provider on rate limit', async () => {
      // First call (Anthropic) - rate limited
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
        headers: { get: () => null }
      })

      // Second call (OpenAI fallback) - success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: createMockClassifierResponse([
                  {
                    message_id: 1,

                    activity: 'Fallback Test',
                    category: 'food',
                    confidence: 0.9
                  }
                ])
              }
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'primary-key',
        fallbackProviders: [{ provider: 'openai', apiKey: 'fallback-key' }]
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.activities[0]?.activity).toBe('Fallback Test')
      }
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.anthropic.com/v1/messages',
        expect.anything()
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.openai.com/v1/chat/completions',
        expect.anything()
      )
    })

    it('tries all fallback providers before failing', async () => {
      // All providers rate limited
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
        headers: { get: () => null }
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'primary-key',
        fallbackProviders: [
          { provider: 'openai', apiKey: 'fallback-key-1' },
          { provider: 'openrouter', apiKey: 'fallback-key-2' }
        ]
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('rate_limit')
        expect(result.error.message).toContain('All providers rate limited')
      }
      // Should have tried all 3 providers
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('does not fall back on auth errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
        headers: { get: () => null }
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'invalid-key',
        fallbackProviders: [{ provider: 'openai', apiKey: 'fallback-key' }]
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('auth')
      }
      // Should only try primary, not fallback
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('does not fall back on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
        ...BASE_CONFIG,
        provider: 'anthropic',
        apiKey: 'test-key',
        fallbackProviders: [{ provider: 'openai', apiKey: 'fallback-key' }]
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
      // Should only try primary, not fallback
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('filterActivities', async () => {
    const { filterActivities } = await import('./index')

    it('returns all activities (no filtering)', () => {
      const suggestions = [
        createTestActivity({ activity: 'Test 1', funScore: 0.9 }),
        createTestActivity({ activity: 'Test 2', funScore: 0.5 }),
        createTestActivity({ activity: 'Test 3', funScore: 0.2 })
      ]

      const filtered = filterActivities(suggestions)

      expect(filtered).toHaveLength(3)
    })
  })

  describe('groupByCategory', async () => {
    const { groupByCategory } = await import('./index')

    it('groups suggestions by category', () => {
      const suggestions = [
        createTestActivity({ activity: 'Restaurant 1', category: 'food' }),
        createTestActivity({ activity: 'Restaurant 2', category: 'food' }),
        createTestActivity({ activity: 'Hiking', category: 'nature' }),
        createTestActivity({ activity: 'Movie', category: 'entertainment' })
      ]

      const groups = groupByCategory(suggestions)

      expect(groups.get('food')).toHaveLength(2)
      expect(groups.get('nature')).toHaveLength(1)
      expect(groups.get('entertainment')).toHaveLength(1)
    })

    it('handles empty array', () => {
      const groups = groupByCategory([])

      expect(groups.size).toBe(0)
    })
  })
})
