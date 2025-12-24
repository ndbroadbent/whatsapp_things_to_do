/**
 * Combined Extraction Tests
 *
 * Tests for extractCandidates() which merges heuristics and embeddings results,
 * and deduplicateAgreements() for agreement/suggestion overlap handling.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CandidateMessage, ParsedMessage, QueryType } from '../types'
import * as embeddingsModule from './embeddings/index'
import * as heuristicsModule from './heuristics/index'
import { deduplicateAgreements } from './index'

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
  sourceType: 'regex' | 'url' | 'semantic',
  candidateType: QueryType = 'suggestion'
): CandidateMessage {
  const source =
    sourceType === 'semantic'
      ? {
          type: 'semantic' as const,
          similarity: confidence,
          query: 'test query',
          queryType: candidateType
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
    confidence,
    candidateType,
    contextBefore: [],
    contextAfter: []
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
      const { extractCandidates } = await import('./index')

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
      const { extractCandidates } = await import('./index')

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
      const { extractCandidates } = await import('./index')

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
      const { extractCandidates } = await import('./index')

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
      const { extractCandidates } = await import('./index')

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
      const { extractCandidates } = await import('./index')

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
      const { extractCandidates } = await import('./index')

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

  describe('agreement deduplication in extractCandidates', () => {
    it('removes agreement candidates within suggestion context window', async () => {
      const { extractCandidates } = await import('./index')

      mockExtractByHeuristics.mockReturnValue({
        candidates: [
          createCandidate(1, 'We should try that new restaurant', 0.8, 'regex', 'suggestion'),
          createCandidate(2, 'Sounds great!', 0.7, 'regex', 'agreement')
        ],
        regexMatches: 2,
        urlMatches: 0,
        totalUnique: 2
      })

      const messages = [
        createMessage(1, 'We should try that new restaurant'),
        createMessage(2, 'Sounds great!')
      ]

      const result = await extractCandidates(messages)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.candidates).toHaveLength(1)
        expect(result.value.candidates[0]?.candidateType).toBe('suggestion')
        expect(result.value.agreementsRemoved).toBe(1)
      }
    })

    it('keeps agreements outside suggestion context window', async () => {
      const { extractCandidates } = await import('./index')

      // Create many filler messages to exceed context window
      const fillerMessages = Array.from({ length: 10 }, (_, i) =>
        createMessage(i + 2, `Filler message ${i + 1} with enough content to exceed context`)
      )

      mockExtractByHeuristics.mockReturnValue({
        candidates: [
          createCandidate(1, 'We should try that restaurant', 0.8, 'regex', 'suggestion'),
          createCandidate(12, 'That looks amazing!', 0.7, 'regex', 'agreement')
        ],
        regexMatches: 2,
        urlMatches: 0,
        totalUnique: 2
      })

      const messages = [
        createMessage(1, 'We should try that restaurant'),
        ...fillerMessages,
        createMessage(12, 'That looks amazing!')
      ]

      const result = await extractCandidates(messages)

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Both kept - agreement is outside suggestion's context window
        expect(result.value.candidates).toHaveLength(2)
        expect(result.value.agreementsRemoved).toBe(0)
      }
    })
  })
})

describe('deduplicateAgreements', () => {
  it('returns empty array for empty input', () => {
    const { candidates, removedCount } = deduplicateAgreements([], [])
    expect(candidates).toEqual([])
    expect(removedCount).toBe(0)
  })

  it('returns all candidates when only suggestions', () => {
    const messages = [createMessage(1, 'Try this restaurant'), createMessage(5, 'Visit that cafe')]
    const candidates = [
      createCandidate(1, 'Try this restaurant', 0.8, 'regex', 'suggestion'),
      createCandidate(5, 'Visit that cafe', 0.7, 'regex', 'suggestion')
    ]

    const { candidates: result, removedCount } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(2)
    expect(removedCount).toBe(0)
  })

  it('returns all candidates when only agreements', () => {
    const messages = [createMessage(1, 'Sounds great'), createMessage(5, 'Love it')]
    const candidates = [
      createCandidate(1, 'Sounds great', 0.8, 'regex', 'agreement'),
      createCandidate(5, 'Love it', 0.7, 'regex', 'agreement')
    ]

    const { candidates: result, removedCount } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(2)
    expect(removedCount).toBe(0)
  })

  it('removes agreement within suggestion context window', () => {
    const messages = [createMessage(1, 'Lets go hiking tomorrow'), createMessage(2, 'Sounds fun!')]
    const candidates = [
      createCandidate(1, 'Lets go hiking tomorrow', 0.9, 'regex', 'suggestion'),
      createCandidate(2, 'Sounds fun!', 0.7, 'regex', 'agreement')
    ]

    const { candidates: result, removedCount } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(1)
    expect(result[0]?.candidateType).toBe('suggestion')
    expect(removedCount).toBe(1)
  })

  it('removes agreement before suggestion within context window', () => {
    // Agreement comes BEFORE suggestion (less common but possible)
    const messages = [createMessage(1, 'That looks fun'), createMessage(2, 'Lets do that hike')]
    const candidates = [
      createCandidate(1, 'That looks fun', 0.7, 'regex', 'agreement'),
      createCandidate(2, 'Lets do that hike', 0.9, 'regex', 'suggestion')
    ]

    const { candidates: result, removedCount } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(1)
    expect(result[0]?.candidateType).toBe('suggestion')
    expect(removedCount).toBe(1)
  })

  it('keeps agreement outside context window', () => {
    // Create enough filler messages to exceed context window
    const fillerMessages = Array.from({ length: 10 }, (_, i) =>
      createMessage(
        i + 2,
        `Filler message ${i + 1} with enough content to exceed context window size`
      )
    )
    const messages = [
      createMessage(1, 'Lets try that restaurant'),
      ...fillerMessages,
      createMessage(12, 'Amazing!')
    ]
    const candidates = [
      createCandidate(1, 'Lets try that restaurant', 0.9, 'regex', 'suggestion'),
      createCandidate(12, 'Amazing!', 0.7, 'regex', 'agreement')
    ]

    const { candidates: result, removedCount } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(2)
    expect(removedCount).toBe(0)
  })

  it('removes multiple agreements within same suggestion context window', () => {
    const messages = [
      createMessage(1, 'Lets go to that cafe'),
      createMessage(2, 'Yes!'),
      createMessage(3, 'Im keen'),
      createMessage(4, 'Sounds good')
    ]
    const candidates = [
      createCandidate(1, 'Lets go to that cafe', 0.9, 'regex', 'suggestion'),
      createCandidate(2, 'Yes!', 0.6, 'regex', 'agreement'),
      createCandidate(3, 'Im keen', 0.7, 'regex', 'agreement'),
      createCandidate(4, 'Sounds good', 0.5, 'regex', 'agreement')
    ]

    const { candidates: result, removedCount } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(1)
    expect(result[0]?.candidateType).toBe('suggestion')
    expect(removedCount).toBe(3)
  })

  it('sorts results by confidence descending', () => {
    // Far apart messages so no deduplication happens
    const fillerMessages = Array.from({ length: 15 }, (_, i) =>
      createMessage(i + 2, `Filler message ${i + 1} with content to exceed context`)
    )
    const messages = [
      createMessage(1, 'Low conf suggestion'),
      ...fillerMessages,
      createMessage(17, 'High conf suggestion'),
      ...Array.from({ length: 15 }, (_, i) =>
        createMessage(i + 18, `More filler ${i + 1} with content`)
      ),
      createMessage(33, 'Medium conf agreement')
    ]
    const candidates = [
      createCandidate(1, 'Low conf suggestion', 0.5, 'regex', 'suggestion'),
      createCandidate(17, 'High conf suggestion', 0.95, 'regex', 'suggestion'),
      createCandidate(33, 'Medium conf agreement', 0.7, 'regex', 'agreement')
    ]

    const { candidates: result } = deduplicateAgreements(candidates, messages)

    expect(result).toHaveLength(3)
    expect(result[0]?.confidence).toBe(0.95)
    expect(result[1]?.confidence).toBe(0.7)
    expect(result[2]?.confidence).toBe(0.5)
  })
})
