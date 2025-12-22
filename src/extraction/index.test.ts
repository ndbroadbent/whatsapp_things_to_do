/**
 * Combined Extraction Tests
 *
 * Tests for extractCandidates() which merges heuristics and embeddings results.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CandidateMessage, ParsedMessage } from '../types.js'
import * as embeddingsModule from './embeddings/index.js'
import * as heuristicsModule from './heuristics/index.js'

// Create spies after importing
const mockExtractByEmbeddings = vi.spyOn(embeddingsModule, 'extractCandidatesByEmbeddings')
const mockExtractByHeuristics = vi.spyOn(heuristicsModule, 'extractCandidatesByHeuristics')

function createMessage(id: number, content: string): ParsedMessage {
  return {
    id,
    content,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    rawLine: `[1/15/25, 10:00:00 AM] Test User: ${content}`,
    hasMedia: false,
    source: 'whatsapp'
  }
}

function createCandidate(
  messageId: number,
  content: string,
  confidence: number,
  sourceType: 'regex' | 'url' | 'semantic'
): CandidateMessage {
  const source =
    sourceType === 'semantic'
      ? {
          type: 'semantic' as const,
          similarity: confidence,
          query: 'test query',
          queryType: 'suggestion' as const
        }
      : sourceType === 'url'
        ? { type: 'url' as const, urlType: 'google_maps' as const }
        : { type: 'regex' as const, pattern: 'test_pattern' }

  return {
    messageId,
    content,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    source,
    confidence
  }
}

describe('extractCandidates (combined)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  describe('heuristics only (no embeddings config)', () => {
    it('returns heuristics results when no embeddings config provided', async () => {
      const { extractCandidates } = await import('./index.js')

      mockExtractByHeuristics.mockReturnValue({
        candidates: [createCandidate(1, 'We should try this restaurant', 0.8, 'regex')],
        regexMatches: 1,
        urlMatches: 0,
        totalUnique: 1
      })

      const messages = [createMessage(1, 'We should try this restaurant')]
      const result = await extractCandidates(messages)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.candidates).toHaveLength(1)
        expect(result.value.embeddingsMatches).toBe(0)
        expect(mockExtractByEmbeddings).not.toHaveBeenCalled()
      }
    })
  })

  describe('with embeddings config', () => {
    it('calls both extractors and merges results', async () => {
      const { extractCandidates } = await import('./index.js')

      mockExtractByHeuristics.mockReturnValue({
        candidates: [createCandidate(1, 'We should try this restaurant', 0.8, 'regex')],
        regexMatches: 1,
        urlMatches: 0,
        totalUnique: 1
      })

      mockExtractByEmbeddings.mockResolvedValue({
        ok: true,
        value: [createCandidate(2, 'Hidden gem activity', 0.7, 'semantic')]
      })

      const messages = [
        createMessage(1, 'We should try this restaurant'),
        createMessage(2, 'Hidden gem activity')
      ]

      const result = await extractCandidates(messages, {
        embeddings: { config: { apiKey: 'test-key' } }
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.candidates).toHaveLength(2)
        expect(result.value.embeddingsMatches).toBe(1)
        expect(result.value.regexMatches).toBe(1)
      }
    })

    it('deduplicates by messageId, keeping highest confidence', async () => {
      const { extractCandidates } = await import('./index.js')

      // Same message found by both, heuristics has lower confidence
      mockExtractByHeuristics.mockReturnValue({
        candidates: [createCandidate(1, 'We should try this restaurant', 0.6, 'regex')],
        regexMatches: 1,
        urlMatches: 0,
        totalUnique: 1
      })

      // Embeddings finds same message with higher confidence
      mockExtractByEmbeddings.mockResolvedValue({
        ok: true,
        value: [createCandidate(1, 'We should try this restaurant', 0.9, 'semantic')]
      })

      const messages = [createMessage(1, 'We should try this restaurant')]

      const result = await extractCandidates(messages, {
        embeddings: { config: { apiKey: 'test-key' } }
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Should have 1 candidate (deduplicated)
        expect(result.value.candidates).toHaveLength(1)
        // Should keep the higher confidence (0.9 from embeddings)
        expect(result.value.candidates[0]?.confidence).toBe(0.9)
        expect(result.value.candidates[0]?.source.type).toBe('semantic')
      }
    })

    it('keeps heuristics result when it has higher confidence', async () => {
      const { extractCandidates } = await import('./index.js')

      // Heuristics has higher confidence
      mockExtractByHeuristics.mockReturnValue({
        candidates: [createCandidate(1, 'Bucket list restaurant', 0.95, 'regex')],
        regexMatches: 1,
        urlMatches: 0,
        totalUnique: 1
      })

      // Embeddings finds same message with lower confidence
      mockExtractByEmbeddings.mockResolvedValue({
        ok: true,
        value: [createCandidate(1, 'Bucket list restaurant', 0.7, 'semantic')]
      })

      const messages = [createMessage(1, 'Bucket list restaurant')]

      const result = await extractCandidates(messages, {
        embeddings: { config: { apiKey: 'test-key' } }
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.candidates).toHaveLength(1)
        // Should keep heuristics (0.95 > 0.7)
        expect(result.value.candidates[0]?.confidence).toBe(0.95)
        expect(result.value.candidates[0]?.source.type).toBe('regex')
      }
    })

    it('sorts merged results by confidence descending', async () => {
      const { extractCandidates } = await import('./index.js')

      mockExtractByHeuristics.mockReturnValue({
        candidates: [
          createCandidate(1, 'Low confidence', 0.5, 'regex'),
          createCandidate(2, 'High confidence', 0.9, 'regex')
        ],
        regexMatches: 2,
        urlMatches: 0,
        totalUnique: 2
      })

      mockExtractByEmbeddings.mockResolvedValue({
        ok: true,
        value: [createCandidate(3, 'Medium confidence', 0.7, 'semantic')]
      })

      const messages = [
        createMessage(1, 'Low confidence'),
        createMessage(2, 'High confidence'),
        createMessage(3, 'Medium confidence')
      ]

      const result = await extractCandidates(messages, {
        embeddings: { config: { apiKey: 'test-key' } }
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.candidates).toHaveLength(3)
        expect(result.value.candidates[0]?.confidence).toBe(0.9)
        expect(result.value.candidates[1]?.confidence).toBe(0.7)
        expect(result.value.candidates[2]?.confidence).toBe(0.5)
      }
    })

    it('returns embeddings error if embeddings fails', async () => {
      const { extractCandidates } = await import('./index.js')

      mockExtractByHeuristics.mockReturnValue({
        candidates: [],
        regexMatches: 0,
        urlMatches: 0,
        totalUnique: 0
      })

      mockExtractByEmbeddings.mockResolvedValue({
        ok: false,
        error: { type: 'auth', message: 'Invalid API key' }
      })

      const messages = [createMessage(1, 'Test message')]

      const result = await extractCandidates(messages, {
        embeddings: { config: { apiKey: 'bad-key' } }
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('auth')
      }
    })

    it('counts embeddings-only matches correctly', async () => {
      const { extractCandidates } = await import('./index.js')

      // Heuristics finds message 1
      mockExtractByHeuristics.mockReturnValue({
        candidates: [createCandidate(1, 'Heuristics match', 0.8, 'regex')],
        regexMatches: 1,
        urlMatches: 0,
        totalUnique: 1
      })

      // Embeddings finds messages 1, 2, and 3
      mockExtractByEmbeddings.mockResolvedValue({
        ok: true,
        value: [
          createCandidate(1, 'Heuristics match', 0.7, 'semantic'), // duplicate
          createCandidate(2, 'Embeddings only 1', 0.6, 'semantic'),
          createCandidate(3, 'Embeddings only 2', 0.5, 'semantic')
        ]
      })

      const messages = [
        createMessage(1, 'Heuristics match'),
        createMessage(2, 'Embeddings only 1'),
        createMessage(3, 'Embeddings only 2')
      ]

      const result = await extractCandidates(messages, {
        embeddings: { config: { apiKey: 'test-key' } }
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        // 3 unique candidates total
        expect(result.value.totalUnique).toBe(3)
        // Embeddings found 3 messages total
        expect(result.value.embeddingsMatches).toBe(3)
        // Heuristics found 1 (the shared one is kept with heuristics source due to higher confidence)
        expect(result.value.regexMatches).toBe(1)
      }
    })
  })
})
