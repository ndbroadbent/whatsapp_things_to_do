import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CandidateMessage, ClassifiedActivity } from '../types.js'

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

function createCandidate(id: number, content: string, sender = 'Test User'): CandidateMessage {
  return {
    messageId: id,
    content,
    sender,
    timestamp: new Date('2025-01-15T10:30:00Z'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8
  }
}

function createMockClassifierResponse(
  items: Array<{
    message_id: number
    is_activity: boolean
    activity: string
    activity_score: number
    category: string
    confidence: number
    city?: string
    country?: string
  }>
): string {
  // Convert to new schema format
  return JSON.stringify(
    items.map((item) => ({
      msg: item.message_id,
      is_act: item.is_activity,
      title: item.activity,
      score: item.activity_score,
      cat: item.category,
      conf: item.confidence,
      gen: true,
      com: true,
      act: null,
      act_orig: null,
      obj: null,
      obj_orig: null,
      venue: null,
      city: item.city ?? null,
      state: null,
      country: item.country ?? null
    }))
  )
}

describe('Classifier Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('classifyMessages', async () => {
    const { classifyMessages } = await import('./index.js')

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
                  is_activity: true,
                  activity: 'Test',
                  activity_score: 0.8,
                  category: 'restaurant',
                  confidence: 0.9
                }
              ])
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'We should try this restaurant')]

      await classifyMessages(candidates, {
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
                    is_activity: true,
                    activity: 'Test',
                    activity_score: 0.8,
                    category: 'restaurant',
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
                    is_activity: true,
                    activity: 'Test',
                    activity_score: 0.8,
                    category: 'restaurant',
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
                  is_activity: true,
                  activity: 'Italian Restaurant',
                  activity_score: 0.9,
                  category: 'restaurant',
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
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0]?.activity).toBe('Italian Restaurant')
        expect(result.value[0]?.category).toBe('restaurant')
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
        headers: { get: (name: string) => (name === 'retry-after' ? '60' : null) }
      })

      const candidates = [createCandidate(1, 'Test')]

      const result = await classifyMessages(candidates, {
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
        is_activity: true,
        activity: 'Test',
        activity_score: 0.8,
        category: 'restaurant',
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
                  is_activity: true,
                  activity: 'Test',
                  activity_score: 0.8,
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
        provider: 'anthropic',
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value[0]?.category).toBe('other')
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
                  is_activity: true,
                  activity: 'Test',
                  activity_score: 0.8,
                  category: 'restaurant',
                  confidence: 0.9
                }
              ])
            }
          ]
        })
      })

      const candidates = [createCandidate(1, 'Test')]

      await classifyMessages(candidates, {
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
                    is_activity: true,
                    activity: 'Fallback Test',
                    activity_score: 0.8,
                    category: 'restaurant',
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
        provider: 'anthropic',
        apiKey: 'primary-key',
        fallbackProviders: [{ provider: 'openai', apiKey: 'fallback-key' }]
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value[0]?.activity).toBe('Fallback Test')
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
    const { filterActivities } = await import('./index.js')

    function createActivity(isActivity: boolean, activityScore: number): ClassifiedActivity {
      return {
        messageId: 1,
        isActivity,
        activity: 'Test',
        activityScore,
        category: 'restaurant',
        confidence: 0.9,
        originalMessage: 'Test',
        sender: 'User',
        timestamp: new Date(),
        isGeneric: true,
        isComplete: true,
        action: null,
        actionOriginal: null,
        object: null,
        objectOriginal: null,
        venue: null,
        city: null,
        state: null,
        country: null
      }
    }

    it('filters out non-activities', () => {
      const suggestions = [createActivity(true, 0.8), createActivity(false, 0.8)]

      const filtered = filterActivities(suggestions)

      expect(filtered).toHaveLength(1)
      expect(filtered[0]?.isActivity).toBe(true)
    })

    it('filters by minimum activity score', () => {
      const suggestions = [
        createActivity(true, 0.3),
        createActivity(true, 0.6),
        createActivity(true, 0.9)
      ]

      const filtered = filterActivities(suggestions, 0.5)

      expect(filtered).toHaveLength(2)
    })

    it('uses default minimum score of 0.5', () => {
      const suggestions = [
        createActivity(true, 0.4),
        createActivity(true, 0.5),
        createActivity(true, 0.6)
      ]

      const filtered = filterActivities(suggestions)

      expect(filtered).toHaveLength(2)
    })
  })

  describe('groupByCategory', async () => {
    const { groupByCategory } = await import('./index.js')

    function createActivity(category: string): ClassifiedActivity {
      return {
        messageId: 1,
        isActivity: true,
        activity: 'Test',
        activityScore: 0.8,
        category: category as ClassifiedActivity['category'],
        confidence: 0.9,
        originalMessage: 'Test',
        sender: 'User',
        timestamp: new Date(),
        isGeneric: true,
        isComplete: true,
        action: null,
        actionOriginal: null,
        object: null,
        objectOriginal: null,
        venue: null,
        city: null,
        state: null,
        country: null
      }
    }

    it('groups suggestions by category', () => {
      const suggestions = [
        createActivity('restaurant'),
        createActivity('hike'),
        createActivity('restaurant'),
        createActivity('cafe')
      ]

      const groups = groupByCategory(suggestions)

      expect(groups.get('restaurant')).toHaveLength(2)
      expect(groups.get('hike')).toHaveLength(1)
      expect(groups.get('cafe')).toHaveLength(1)
    })

    it('handles empty array', () => {
      const groups = groupByCategory([])

      expect(groups.size).toBe(0)
    })
  })
})
