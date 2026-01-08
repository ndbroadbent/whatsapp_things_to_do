import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmbeddedMessage, ParsedMessage } from '../../types'

// Mock httpFetch before importing - explicitly re-export other functions
const mockFetch = vi.fn()
vi.mock('../../http', () => ({
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

// text-embedding-3-large produces 3072-dimension embeddings
const EMBEDDING_DIMENSIONS = 3072

function createMockEmbedding(seed = 0): number[] {
  // Create a 3072-dimension embedding with deterministic values based on seed
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => Math.sin(seed + i) * 0.1)
}

function createEmbeddingResponse(count: number): {
  data: Array<{ embedding: number[]; index: number }>
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
} {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      embedding: createMockEmbedding(index),
      index
    })),
    model: 'text-embedding-3-large',
    usage: { prompt_tokens: 100, total_tokens: 100 }
  }
}

function createParsedMessage(id: number, content: string): ParsedMessage {
  return {
    id,
    timestamp: new Date('2025-01-15T10:30:00Z'),
    sender: 'Test User',
    content,
    rawLine: content,
    hasMedia: false,
    source: 'whatsapp'
  }
}

describe('Embeddings Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('messageEmbeddings', async () => {
    const { messageEmbeddings } = await import('./index')

    it('calls OpenAI API with correct parameters', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(1)
      })

      const messages = [{ id: 1, content: 'Test message' }]

      await messageEmbeddings(messages, { apiKey: 'test-key' })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key'
          })
        })
      )
    })

    it('uses default model when not specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(1)
      })

      const messages = [{ id: 1, content: 'Test message' }]

      await messageEmbeddings(messages, { apiKey: 'test-key' })

      const call = mockFetch.mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(call[1].body) as { model: string }
      expect(body.model).toBe('text-embedding-3-large')
    })

    it('uses custom model when specified', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(1)
      })

      const messages = [{ id: 1, content: 'Test message' }]

      await messageEmbeddings(messages, {
        apiKey: 'test-key',
        model: 'text-embedding-ada-002'
      })

      const call = mockFetch.mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(call[1].body) as { model: string }
      expect(body.model).toBe('text-embedding-ada-002')
    })

    it('streams embedded messages via onBatch callback', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(2)
      })

      const messages = [
        { id: 1, content: 'First message' },
        { id: 2, content: 'Second message' }
      ]

      const batches: Array<{ messageId: number; embedding: Float32Array }[]> = []
      const result = await messageEmbeddings(messages, { apiKey: 'test-key' }, undefined, {
        onBatch: (embeddings) => batches.push([...embeddings])
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.totalEmbedded).toBe(2)
        expect(batches).toHaveLength(1)
        expect(batches[0]).toHaveLength(2)
        expect(batches[0]?.[0]?.messageId).toBe(1)
        expect(batches[0]?.[0]?.embedding).toBeInstanceOf(Float32Array)
      }
    })

    it('handles HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key',
        headers: { get: () => null }
      })

      const messages = [{ id: 1, content: 'Test' }]

      const result = await messageEmbeddings(messages, { apiKey: 'invalid' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('auth')
      }
    })

    it('handles network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network failure'))

      const messages = [{ id: 1, content: 'Test' }]

      const result = await messageEmbeddings(messages, { apiKey: 'test-key' })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })

    it('processes messages in batches', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(1)
      })

      const messages = Array.from({ length: 250 }, (_, i) => ({
        id: i + 1,
        content: `Message ${i + 1}`
      }))

      await messageEmbeddings(messages, { apiKey: 'test-key' }, undefined, {
        batchSize: 100
      })

      // Should make 3 API calls (100 + 100 + 50)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('respects max batch size of 2048', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(1)
      })

      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        content: `Message ${i + 1}`
      }))

      await messageEmbeddings(messages, { apiKey: 'test-key' }, undefined, {
        batchSize: 5000
      })

      // Should still batch at max 2048
      const call = mockFetch.mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(call[1].body) as { input: string[] }
      expect(body.input.length).toBeLessThanOrEqual(2048)
    })
  })

  describe('embedQueries', async () => {
    const { embedQueries } = await import('./index')

    it('embeds query strings', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(2)
      })

      const queries = ['hiking trail', 'restaurant recommendation']

      const result = await embedQueries(queries, { apiKey: 'test-key' })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toHaveLength(2)
        expect(result.value[0]).toBeInstanceOf(Float32Array)
      }
    })
  })

  describe('findSemanticCandidates', async () => {
    const { findSemanticCandidates } = await import('./index')

    function createEmbeddedMessage(id: number, embedding: number[]): EmbeddedMessage {
      return {
        messageId: id,
        content: `Message ${id}`,
        embedding: new Float32Array(embedding)
      }
    }

    it('finds candidates based on similarity', () => {
      const embeddings = [
        createEmbeddedMessage(1, [1.0, 0.0, 0.0]),
        createEmbeddedMessage(2, [0.9, 0.1, 0.0]),
        createEmbeddedMessage(3, [0.0, 1.0, 0.0])
      ]
      const queryEmbeddings = [new Float32Array([1.0, 0.0, 0.0])]
      const messages = [
        createParsedMessage(1, 'Message 1'),
        createParsedMessage(2, 'Message 2'),
        createParsedMessage(3, 'Message 3')
      ]

      const candidates = findSemanticCandidates(embeddings, queryEmbeddings, messages, {
        minSimilarity: 0.5
      })

      // Messages 1 and 2 should match (similar to query), message 3 should not
      expect(candidates.length).toBeGreaterThanOrEqual(1)
      expect(candidates[0]?.messageId).toBe(1) // Most similar
    })

    it('respects topK limit', () => {
      const embeddings = Array.from({ length: 100 }, (_, i) =>
        createEmbeddedMessage(i + 1, [1.0 - i * 0.01, 0.0, 0.0])
      )
      const queryEmbeddings = [new Float32Array([1.0, 0.0, 0.0])]
      const messages = Array.from({ length: 100 }, (_, i) =>
        createParsedMessage(i + 1, `Message ${i + 1}`)
      )

      const candidates = findSemanticCandidates(embeddings, queryEmbeddings, messages, {
        topK: 10,
        minSimilarity: 0.0
      })

      expect(candidates.length).toBeLessThanOrEqual(10)
    })

    it('filters by minimum similarity', () => {
      const embeddings = [
        createEmbeddedMessage(1, [1.0, 0.0, 0.0]),
        createEmbeddedMessage(2, [0.0, 0.0, 1.0])
      ]
      const queryEmbeddings = [new Float32Array([1.0, 0.0, 0.0])]
      const messages = [createParsedMessage(1, 'Message 1'), createParsedMessage(2, 'Message 2')]

      const candidates = findSemanticCandidates(embeddings, queryEmbeddings, messages, {
        minSimilarity: 0.9
      })

      expect(candidates.length).toBe(1)
      expect(candidates[0]?.messageId).toBe(1)
    })

    it('returns sorted by confidence descending', () => {
      const embeddings = [
        createEmbeddedMessage(1, [0.8, 0.2, 0.0]),
        createEmbeddedMessage(2, [1.0, 0.0, 0.0]),
        createEmbeddedMessage(3, [0.6, 0.4, 0.0])
      ]
      const queryEmbeddings = [new Float32Array([1.0, 0.0, 0.0])]
      const messages = [
        createParsedMessage(1, 'Message 1'),
        createParsedMessage(2, 'Message 2'),
        createParsedMessage(3, 'Message 3')
      ]

      const candidates = findSemanticCandidates(embeddings, queryEmbeddings, messages, {
        minSimilarity: 0.0
      })

      expect(candidates[0]?.messageId).toBe(2) // Highest similarity
      expect(candidates[0]?.confidence).toBeGreaterThanOrEqual(candidates[1]?.confidence ?? 0)
    })

    it('merges results from multiple queries', () => {
      const embeddings = [
        createEmbeddedMessage(1, [1.0, 0.0]),
        createEmbeddedMessage(2, [0.0, 1.0])
      ]
      const queryEmbeddings = [new Float32Array([1.0, 0.0]), new Float32Array([0.0, 1.0])]
      const messages = [createParsedMessage(1, 'Message 1'), createParsedMessage(2, 'Message 2')]

      const candidates = findSemanticCandidates(embeddings, queryEmbeddings, messages, {
        minSimilarity: 0.5,
        queries: ['query 1', 'query 2']
      })

      expect(candidates.length).toBe(2)
    })

    it('sets semantic source type', () => {
      const embeddings = [createEmbeddedMessage(1, [1.0, 0.0])]
      const queryEmbeddings = [new Float32Array([1.0, 0.0])]
      const messages = [createParsedMessage(1, 'Message 1')]

      const candidates = findSemanticCandidates(embeddings, queryEmbeddings, messages, {
        minSimilarity: 0.0
      })

      expect(candidates[0]?.source.type).toBe('semantic')
    })
  })

  describe('extractCandidatesByEmbeddings', async () => {
    const { extractCandidatesByEmbeddings } = await import('./index')

    it('performs full semantic search pipeline', async () => {
      // Mock embedding responses for messages (queries use pre-computed embeddings)
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(2)
      })

      const messages = [
        createParsedMessage(1, 'We should try this restaurant sometime'),
        createParsedMessage(2, 'Random message that is long enough')
      ]

      const result = await extractCandidatesByEmbeddings(messages, {
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(true)
      // Should have called API once for messages (queries use pre-computed embeddings)
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1)
    })

    it('filters short messages', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createEmbeddingResponse(1)
      })

      const messages = [
        createParsedMessage(1, 'Short'),
        createParsedMessage(2, 'This is a longer message with more content')
      ]

      await extractCandidatesByEmbeddings(messages, { apiKey: 'test-key' })

      const call = mockFetch.mock.calls[0] as [string, { body: string }]
      const body = JSON.parse(call[1].body) as { input: string[] }
      // Only the longer message should be embedded
      expect(body.input).toHaveLength(1)
    })

    it('returns error on embedding failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server error',
        headers: { get: () => null }
      })

      const messages = [createParsedMessage(1, 'Test message content')]

      const result = await extractCandidatesByEmbeddings(messages, {
        apiKey: 'test-key'
      })

      expect(result.ok).toBe(false)
    })
  })

  describe('DEFAULT_ACTIVITY_QUERIES', async () => {
    const { DEFAULT_ACTIVITY_QUERIES } = await import('./index')

    it('contains activity-related queries', () => {
      expect(DEFAULT_ACTIVITY_QUERIES.length).toBeGreaterThan(0)
      expect(DEFAULT_ACTIVITY_QUERIES.some((q) => q.includes('restaurant'))).toBe(true)
      expect(DEFAULT_ACTIVITY_QUERIES.some((q) => q.includes('hiking'))).toBe(true)
    })
  })
})
