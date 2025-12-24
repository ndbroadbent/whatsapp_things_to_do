/**
 * Filter Step Tests
 *
 * Tests for merging heuristics + embeddings candidates with cross-source
 * agreement deduplication.
 */

import { describe, expect, it } from 'vitest'
import type { CandidateMessage, ParsedMessage } from '../../types'
import { mergeAndDeduplicateCandidates } from './filter'

function createMessage(id: number, content: string, sender = 'User'): ParsedMessage {
  return {
    id,
    content,
    sender,
    timestamp: new Date('2025-01-15T10:00:00Z'),
    rawLine: `[1/15/25, 10:00:00 AM] ${sender}: ${content}`,
    hasMedia: false,
    source: 'whatsapp'
  }
}

function createCandidate(
  messageId: number,
  content: string,
  candidateType: 'suggestion' | 'agreement',
  source: 'heuristics' | 'embeddings'
): CandidateMessage {
  return {
    messageId,
    content,
    sender: 'User',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    confidence: 0.8,
    candidateType,
    contextBefore: [],
    contextAfter: [],
    source:
      source === 'heuristics'
        ? { type: 'regex', pattern: 'test' }
        : { type: 'semantic', similarity: 0.5, query: 'test', queryType: 'suggestion' }
  }
}

describe('mergeAndDeduplicateCandidates', () => {
  it('merges heuristics and embeddings candidates', () => {
    const messages: ParsedMessage[] = [
      createMessage(1, 'Hike tomorrow?', 'User'),
      createMessage(2, 'Let us go skiing', 'User')
    ]
    const heuristics = [createCandidate(1, 'Hike tomorrow?', 'suggestion', 'heuristics')]
    const embeddings = [createCandidate(2, 'Let us go skiing', 'suggestion', 'embeddings')]

    const result = mergeAndDeduplicateCandidates(heuristics, embeddings, messages)

    expect(result.candidates).toHaveLength(2)
    expect(result.candidates.map((c) => c.messageId)).toEqual([1, 2])
  })

  it('deduplicates by messageId, keeping heuristics over embeddings', () => {
    const messages = [createMessage(1, 'Same message', 'User')]
    const heuristics = [createCandidate(1, 'Same message', 'suggestion', 'heuristics')]
    const embeddings = [createCandidate(1, 'Same message', 'suggestion', 'embeddings')]

    const result = mergeAndDeduplicateCandidates(heuristics, embeddings, messages)

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.source.type).toBe('regex') // heuristics kept
  })

  it('removes agreement from heuristics when near suggestion from embeddings', () => {
    // Real bug scenario: "Paintball. Saturday?" from embeddings, "I'm keen!" from heuristics
    // The agreement should be removed because it's within context of the suggestion
    const messages: ParsedMessage[] = [
      createMessage(158, 'Paintball. Saturday?', 'John'),
      createMessage(159, "I'm keen!", 'Alice')
    ]

    const heuristics = [createCandidate(159, "I'm keen!", 'agreement', 'heuristics')]
    const embeddings = [createCandidate(158, 'Paintball. Saturday?', 'suggestion', 'embeddings')]

    const result = mergeAndDeduplicateCandidates(heuristics, embeddings, messages)

    // Agreement should be removed - only the suggestion should remain
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.content).toBe('Paintball. Saturday?')
    expect(result.agreementsRemoved).toBe(1)
  })

  it('keeps agreement when not near any suggestion', () => {
    const messages: ParsedMessage[] = [
      createMessage(1, 'Random chat', 'Alice'),
      createMessage(2, 'More chat', 'John'),
      createMessage(100, "I'm keen!", 'Alice') // Far from any suggestion
    ]

    const heuristics = [createCandidate(100, "I'm keen!", 'agreement', 'heuristics')]
    const embeddings: CandidateMessage[] = []

    const result = mergeAndDeduplicateCandidates(heuristics, embeddings, messages)

    expect(result.candidates).toHaveLength(1)
    expect(result.agreementsRemoved).toBe(0)
  })
})
