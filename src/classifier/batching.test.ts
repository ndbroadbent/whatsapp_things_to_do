import { describe, expect, it } from 'vitest'
import type { CandidateMessage } from '../types'
import { createSmartBatches, groupCandidatesByProximity } from './batching'

function createCandidate(id: number): CandidateMessage {
  return {
    messageId: id,
    content: `Message ${id}`,
    sender: 'User',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    candidateType: 'suggestion',
    contextBefore: [],
    contextAfter: []
  }
}

describe('groupCandidatesByProximity', () => {
  it('returns empty array for empty input', () => {
    expect(groupCandidatesByProximity([])).toEqual([])
  })

  it('groups single candidate', () => {
    const candidates = [createCandidate(1)]

    const groups = groupCandidatesByProximity(candidates)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(1)
    expect(groups[0]?.[0]?.messageId).toBe(1)
  })

  it('groups nearby candidates together', () => {
    const candidates = [createCandidate(1), createCandidate(3), createCandidate(5)]

    const groups = groupCandidatesByProximity(candidates)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(3)
  })

  it('splits distant candidates into separate groups', () => {
    const candidates = [
      createCandidate(1),
      createCandidate(3),
      createCandidate(20),
      createCandidate(22)
    ]

    const groups = groupCandidatesByProximity(candidates)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveLength(2)
    expect(groups[1]).toHaveLength(2)
  })

  it('respects custom proximity gap', () => {
    const candidates = [createCandidate(1), createCandidate(5), createCandidate(10)]

    // With default gap of 5, should be one group (gaps are 4 and 5)
    const defaultGroups = groupCandidatesByProximity(candidates)
    expect(defaultGroups).toHaveLength(1)

    // With gap of 3, should be multiple groups
    const smallGapGroups = groupCandidatesByProximity(candidates, 3)
    expect(smallGapGroups).toHaveLength(3)
  })

  it('sorts candidates by message ID before grouping', () => {
    // Unsorted input
    const candidates = [createCandidate(20), createCandidate(1), createCandidate(3)]

    const groups = groupCandidatesByProximity(candidates)

    // Should be two groups: [1, 3] and [20]
    expect(groups).toHaveLength(2)
    expect(groups[0]?.[0]?.messageId).toBe(1)
    expect(groups[0]?.[1]?.messageId).toBe(3)
    expect(groups[1]?.[0]?.messageId).toBe(20)
  })

  it('handles large gaps correctly', () => {
    const candidates = [createCandidate(1), createCandidate(100), createCandidate(200)]

    const groups = groupCandidatesByProximity(candidates)

    expect(groups).toHaveLength(3)
    expect(groups[0]).toHaveLength(1)
    expect(groups[1]).toHaveLength(1)
    expect(groups[2]).toHaveLength(1)
  })

  it('handles consecutive IDs as one group', () => {
    const candidates = [
      createCandidate(10),
      createCandidate(11),
      createCandidate(12),
      createCandidate(13),
      createCandidate(14)
    ]

    const groups = groupCandidatesByProximity(candidates)

    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(5)
  })

  it('creates three groups for three separate discussions', () => {
    const candidates = [
      // Discussion 1: messages 1-5
      createCandidate(1),
      createCandidate(3),
      createCandidate(5),
      // Discussion 2: messages 50-55
      createCandidate(50),
      createCandidate(52),
      createCandidate(55),
      // Discussion 3: messages 100-102
      createCandidate(100),
      createCandidate(102)
    ]

    const groups = groupCandidatesByProximity(candidates)

    expect(groups).toHaveLength(3)
    expect(groups[0]).toHaveLength(3)
    expect(groups[1]).toHaveLength(3)
    expect(groups[2]).toHaveLength(2)
  })
})

describe('createSmartBatches', () => {
  it('returns empty array for empty input', () => {
    expect(createSmartBatches([], 10)).toEqual([])
  })

  it('creates single batch when candidates fit', () => {
    const candidates = [createCandidate(1), createCandidate(2), createCandidate(3)]

    const batches = createSmartBatches(candidates, 10)

    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(3)
  })

  it('keeps nearby candidates together even across batch boundary', () => {
    // Two discussions: 1-5 and 100-104
    const candidates = [
      createCandidate(1),
      createCandidate(2),
      createCandidate(3),
      createCandidate(4),
      createCandidate(5),
      createCandidate(100),
      createCandidate(101),
      createCandidate(102),
      createCandidate(103),
      createCandidate(104)
    ]

    // With batch size 7, naive batching would split discussion 2
    // Smart batching should keep each discussion together
    const batches = createSmartBatches(candidates, 7)

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(5) // Discussion 1
    expect(batches[1]).toHaveLength(5) // Discussion 2
  })

  it('combines small groups into batches', () => {
    // Three small discussions
    const candidates = [
      createCandidate(1),
      createCandidate(2), // Group 1
      createCandidate(50),
      createCandidate(51), // Group 2
      createCandidate(100),
      createCandidate(101) // Group 3
    ]

    // With batch size 5, groups should be combined
    const batches = createSmartBatches(candidates, 5)

    expect(batches).toHaveLength(2)
    // First batch: groups 1+2 (4 items)
    expect(batches[0]).toHaveLength(4)
    // Second batch: group 3 (2 items)
    expect(batches[1]).toHaveLength(2)
  })

  it('splits large groups that exceed batch size', () => {
    // One large group that exceeds batch size
    const candidates = Array.from({ length: 15 }, (_, i) => createCandidate(i + 1))

    const batches = createSmartBatches(candidates, 10)

    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(10)
    expect(batches[1]).toHaveLength(5)
  })

  it('respects proximity gap parameter', () => {
    const candidates = [createCandidate(1), createCandidate(4), createCandidate(7)]

    // With default gap of 5, all are in same group
    const defaultBatches = createSmartBatches(candidates, 10)
    expect(defaultBatches).toHaveLength(1)
    expect(defaultBatches[0]).toHaveLength(3)

    // With gap of 2, each is separate
    const smallGapBatches = createSmartBatches(candidates, 10, 2)
    expect(smallGapBatches).toHaveLength(1) // Still one batch, but groups are separate
    // Since they fit in one batch, they're combined
    expect(smallGapBatches[0]).toHaveLength(3)
  })

  it('produces same result as naive batching for evenly spaced candidates', () => {
    // Widely spaced candidates (each is its own group)
    const candidates = [createCandidate(1), createCandidate(100), createCandidate(200)]

    // With batch size 10, each goes in one batch
    const batches = createSmartBatches(candidates, 10)

    expect(batches).toHaveLength(1) // All fit in one batch
    expect(batches[0]).toHaveLength(3)
  })

  it('handles realistic conversation pattern', () => {
    // Realistic scenario: several small discussions spread across a chat
    const candidates = [
      // Morning discussion about hiking
      createCandidate(10),
      createCandidate(12),
      createCandidate(15),
      // Afternoon discussion about restaurants
      createCandidate(150),
      createCandidate(152),
      // Evening discussion about travel
      createCandidate(300),
      createCandidate(302),
      createCandidate(305),
      createCandidate(308)
    ]

    const batches = createSmartBatches(candidates, 5)

    // Smart batching combines small groups to fill batches efficiently
    // Group 1 (3) + Group 2 (2) = 5 items fits in one batch
    // Group 3 (4) goes in second batch
    expect(batches).toHaveLength(2)
    expect(batches[0]).toHaveLength(5) // Hiking + Restaurant discussions
    expect(batches[1]).toHaveLength(4) // Travel discussion
  })
})
