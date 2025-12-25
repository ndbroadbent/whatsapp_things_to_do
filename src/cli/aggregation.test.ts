import { describe, expect, it } from 'vitest'
import { createActivity as createTestActivity } from '../test-support'
import type { ClassifiedActivity } from '../types'
import {
  deduplicateActivities,
  filterByMentionCount,
  getFirstMentionedAt,
  getLastMentionedAt,
  getMentionCount,
  getMostWanted
} from './aggregation'

function createActivity(
  overrides: Partial<ClassifiedActivity> & { activity: string; id: number }
): ClassifiedActivity {
  const { id, ...rest } = overrides
  return createTestActivity({
    action: 'try',
    messages: [
      {
        id,
        sender: 'User',
        timestamp: new Date('2025-01-15T10:00:00Z'),
        message: `Let's do ${overrides.activity}`
      }
    ],
    ...rest
  })
}

describe('Aggregation Module', () => {
  describe('deduplicateActivities', () => {
    it('returns empty array for empty input', () => {
      const result = deduplicateActivities([])
      expect(result).toEqual([])
    })

    it('returns single activity unchanged', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'Dinner at Italian Place',
          action: 'eat',
          object: 'dinner',
          venue: 'Trattoria Roma',
          city: 'Rome',
          country: 'Italy'
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(1)
      const first = result[0]
      if (!first) throw new Error('Expected first result')
      expect(getMentionCount(first)).toBe(1)
      expect(first.messages).toHaveLength(1)
    })

    it('groups by exact title match (>= 95% similarity)', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          action: 'take',
          object: 'class',
          city: 'Auckland'
        }),
        createActivity({
          id: 2,
          activity: 'Pottery Class',
          action: 'take',
          object: 'class',
          city: 'Auckland'
        }),
        createActivity({
          id: 3,
          activity: 'pottery classes',
          action: 'take',
          object: 'class',
          city: 'Auckland'
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(1)
      const first = result[0]
      if (!first) throw new Error('Expected first result')
      expect(getMentionCount(first)).toBe(3)
    })

    it('groups by field match when non-compound with wildcards', () => {
      // Same action/object, one has city, one has country only - should match
      const activities = [
        createActivity({
          id: 1,
          activity: 'Go hiking in NZ',
          action: 'hike',
          object: 'trail',
          city: 'Queenstown',
          country: 'New Zealand'
        }),
        createActivity({
          id: 2,
          activity: 'Hiking trip',
          action: 'hike',
          object: 'trail',
          country: 'New Zealand'
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(1)
      const first = result[0]
      if (!first) throw new Error('Expected first result')
      expect(getMentionCount(first)).toBe(2)
    })

    it('does not group compound activities by fields', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'Go to Iceland and see aurora',
          action: 'visit',
          object: 'aurora',
          country: 'Iceland',
          isCompound: true
        }),
        createActivity({
          id: 2,
          activity: 'Visit Iceland for northern lights',
          action: 'visit',
          object: 'aurora',
          country: 'Iceland',
          isCompound: true
        })
      ]

      const result = deduplicateActivities(activities)

      // Compound activities only match on exact title, not fields
      expect(result).toHaveLength(2)
    })

    it('does not group activities with different actions', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          action: 'make',
          object: 'pottery',
          city: 'Auckland'
        }),
        createActivity({
          id: 2,
          activity: 'cooking class',
          action: 'cook',
          object: 'food',
          city: 'Auckland'
        }),
        createActivity({
          id: 3,
          activity: 'yoga class',
          action: 'practice',
          object: 'yoga',
          city: 'Auckland'
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(3)
      expect(result.every((r) => getMentionCount(r) === 1)).toBe(true)
    })

    it('groups by venue similarity (95%)', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'Dinner at Kazuya',
          action: 'eat',
          object: 'dinner',
          venue: 'Kazuya Restaurant',
          city: 'Auckland'
        }),
        createActivity({
          id: 2,
          activity: 'Try Kazuya',
          action: 'eat',
          object: 'dinner',
          venue: 'Kazuya',
          city: 'Auckland'
        })
      ]

      const result = deduplicateActivities(activities)

      // "Kazuya" vs "Kazuya Restaurant" - not 95% similar, should NOT match
      expect(result).toHaveLength(2)
    })

    it('calculates correct date range', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          action: 'take',
          object: 'class',
          messages: [
            { id: 1, sender: 'Alice', timestamp: new Date('2022-01-15'), message: 'pottery' }
          ]
        }),
        createActivity({
          id: 2,
          activity: 'Pottery Class',
          action: 'take',
          object: 'class',
          messages: [
            { id: 2, sender: 'Bob', timestamp: new Date('2023-06-20'), message: 'pottery' }
          ]
        }),
        createActivity({
          id: 3,
          activity: 'pottery classes',
          action: 'take',
          object: 'class',
          messages: [
            { id: 3, sender: 'Charlie', timestamp: new Date('2024-12-01'), message: 'pottery' }
          ]
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(1)
      const first = result[0]
      if (!first) throw new Error('Expected first result')
      expect(getFirstMentionedAt(first)).toEqual(new Date('2022-01-15'))
      expect(getLastMentionedAt(first)).toEqual(new Date('2024-12-01'))
    })

    it('preserves all source messages from merged activities', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'Dinner at Sidart',
          action: 'eat',
          venue: 'Sidart',
          city: 'Auckland',
          messages: [
            { id: 1, sender: 'Alice', timestamp: new Date('2022-01-01'), message: 'Try Sidart' }
          ]
        }),
        createActivity({
          id: 2,
          activity: 'dinner at Sidart',
          action: 'eat',
          venue: 'Sidart',
          city: 'Auckland',
          messages: [
            { id: 2, sender: 'Bob', timestamp: new Date('2023-01-01'), message: 'Sidart is great' }
          ]
        }),
        createActivity({
          id: 3,
          activity: 'Dinner at sidart',
          action: 'eat',
          venue: 'Sidart',
          city: 'Auckland',
          messages: [
            {
              id: 3,
              sender: 'Charlie',
              timestamp: new Date('2024-01-01'),
              message: 'We should go to Sidart'
            }
          ]
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(1)
      expect(result[0]?.messages).toHaveLength(3)

      const senders = result[0]?.messages.map((m) => m.sender)
      expect(senders).toContain('Alice')
      expect(senders).toContain('Bob')
      expect(senders).toContain('Charlie')
    })

    it('averages funScore and interestingScore across merged activities', () => {
      const act1 = createActivity({
        id: 1,
        activity: 'pottery class',
        action: 'take',
        object: 'class',
        funScore: 0.8,
        interestingScore: 0.6
      })
      const act2 = createActivity({
        id: 2,
        activity: 'Pottery Class',
        action: 'take',
        object: 'class',
        funScore: 0.6,
        interestingScore: 0.4
      })
      const act3 = createActivity({
        id: 3,
        activity: 'pottery classes',
        action: 'take',
        object: 'class',
        funScore: 0.7,
        interestingScore: 0.5
      })

      const result = deduplicateActivities([act1, act2, act3])

      expect(result).toHaveLength(1)
      expect(result[0]?.funScore).toBe(0.7) // (0.8 + 0.6 + 0.7) / 3 = 0.7
      expect(result[0]?.interestingScore).toBe(0.5) // (0.6 + 0.4 + 0.5) / 3 = 0.5
      expect(result[0]?.score).toBe(1.7) // 0.5 * 2 + 0.7 = 1.7
    })

    it('keeps first occurrence as primary when merging', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          action: 'take',
          object: 'class',
          city: 'Auckland',
          country: 'New Zealand',
          messages: [
            { id: 1, sender: 'Alice', timestamp: new Date('2022-01-01'), message: 'pottery class' }
          ]
        }),
        createActivity({
          id: 2,
          activity: 'Pottery Class',
          action: 'take',
          object: 'class',
          city: 'Wellington',
          country: 'New Zealand',
          messages: [
            { id: 2, sender: 'Bob', timestamp: new Date('2024-01-01'), message: 'Pottery Class' }
          ]
        })
      ]

      const result = deduplicateActivities(activities)

      expect(result).toHaveLength(1)
      // First occurrence is the primary
      expect(result[0]?.activity).toBe('pottery class')
      expect(result[0]?.city).toBe('Auckland')
    })
  })

  describe('filterByMentionCount', () => {
    it('filters activities below minimum count', () => {
      const act1 = createActivity({ id: 1, activity: 'once', action: 'do' })
      const act2 = createTestActivity({
        activity: 'thrice',
        action: 'do',
        messages: [
          { id: 2, sender: 'A', timestamp: new Date(), message: 'thrice' },
          { id: 3, sender: 'B', timestamp: new Date(), message: 'thrice' },
          { id: 4, sender: 'C', timestamp: new Date(), message: 'thrice' }
        ]
      })
      const act3 = createTestActivity({
        activity: 'five times',
        action: 'do',
        messages: [
          { id: 5, sender: 'A', timestamp: new Date(), message: 'five' },
          { id: 6, sender: 'B', timestamp: new Date(), message: 'five' },
          { id: 7, sender: 'C', timestamp: new Date(), message: 'five' },
          { id: 8, sender: 'D', timestamp: new Date(), message: 'five' },
          { id: 9, sender: 'E', timestamp: new Date(), message: 'five' }
        ]
      })

      const result = filterByMentionCount([act1, act2, act3], 3)

      expect(result).toHaveLength(2)
      expect(result.map((r) => getMentionCount(r))).toEqual([3, 5])
    })
  })

  describe('getMostWanted', () => {
    it('returns only activities mentioned more than once', () => {
      // Three distinct activities with different actions - they should NOT merge
      const raw = [
        createActivity({ id: 1, activity: 'Once mentioned', action: 'visit', object: 'place' }),
        createActivity({ id: 2, activity: 'Twice mentioned', action: 'try', object: 'food' }),
        createActivity({ id: 3, activity: 'twice mentioned', action: 'try', object: 'food' }),
        createActivity({ id: 4, activity: 'Thrice mentioned', action: 'explore', object: 'trail' }),
        createActivity({ id: 5, activity: 'thrice mentioned', action: 'explore', object: 'trail' }),
        createActivity({ id: 6, activity: 'Thrice Mentioned', action: 'explore', object: 'trail' })
      ]

      const deduped = deduplicateActivities(raw)
      const result = getMostWanted(deduped)

      expect(result).toHaveLength(2)
      expect(result.every((r) => getMentionCount(r) > 1)).toBe(true)
    })

    it('respects limit parameter', () => {
      // Three distinct activities that will each merge into one
      const raw = [
        createActivity({ id: 1, activity: 'Activity A', action: 'do', object: 'thing-a' }),
        createActivity({ id: 2, activity: 'activity a', action: 'do', object: 'thing-a' }),
        createActivity({ id: 3, activity: 'Activity B', action: 'see', object: 'thing-b' }),
        createActivity({ id: 4, activity: 'activity b', action: 'see', object: 'thing-b' }),
        createActivity({ id: 5, activity: 'Activity C', action: 'try', object: 'thing-c' }),
        createActivity({ id: 6, activity: 'activity c', action: 'try', object: 'thing-c' })
      ]

      const deduped = deduplicateActivities(raw)
      const result = getMostWanted(deduped, 2)

      expect(result).toHaveLength(2)
    })
  })
})
