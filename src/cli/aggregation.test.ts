import { describe, expect, it } from 'vitest'
import { createActivity as createTestActivity } from '../test-support'
import type { ClassifiedActivity } from '../types'
import {
  aggregateActivities,
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
  describe('aggregateActivities', () => {
    it('returns empty array for empty input', () => {
      const result = aggregateActivities([])
      expect(result).toEqual([])
    })

    it('returns single activity unchanged', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'Dinner at Italian Place',
          image: { stock: 'italian dinner rome', mediaKey: 'dinner', preferStock: false },
          placeName: 'Trattoria Roma',
          city: 'Rome',
          country: 'Italy'
        })
      ]

      const result = aggregateActivities(activities)

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
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          city: 'Auckland'
        }),
        createActivity({
          id: 2,
          activity: 'Pottery Class',
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          city: 'Auckland'
        }),
        createActivity({
          id: 3,
          activity: 'pottery classes',
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          city: 'Auckland'
        })
      ]

      const result = aggregateActivities(activities)

      expect(result).toHaveLength(1)
      const first = result[0]
      if (!first) throw new Error('Expected first result')
      expect(getMentionCount(first)).toBe(3)
    })

    it('groups by field match with wildcards', () => {
      // Same mediaKey, one has city, one has country only - should match
      const activities = [
        createActivity({
          id: 1,
          activity: 'Go hiking in NZ',
          image: { stock: 'hiking trail queenstown', mediaKey: 'hiking', preferStock: true },
          city: 'Queenstown',
          country: 'New Zealand'
        }),
        createActivity({
          id: 2,
          activity: 'Hiking trip',
          image: { stock: 'hiking nz', mediaKey: 'hiking', preferStock: true },
          country: 'New Zealand'
        })
      ]

      const result = aggregateActivities(activities)

      expect(result).toHaveLength(1)
      const first = result[0]
      if (!first) throw new Error('Expected first result')
      expect(getMentionCount(first)).toBe(2)
    })

    it('does not group activities with different mediaKeys', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          city: 'Auckland'
        }),
        createActivity({
          id: 2,
          activity: 'cooking class',
          image: { stock: 'cooking class', mediaKey: 'cooking', preferStock: false },
          city: 'Auckland'
        }),
        createActivity({
          id: 3,
          activity: 'yoga class',
          image: { stock: 'yoga class', mediaKey: 'yoga', preferStock: false },
          city: 'Auckland'
        })
      ]

      const result = aggregateActivities(activities)

      expect(result).toHaveLength(3)
      expect(result.every((r) => getMentionCount(r) === 1)).toBe(true)
    })

    it('groups by placeName similarity (95%)', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'Dinner at Kazuya',
          image: { stock: 'dinner kazuya auckland', mediaKey: 'restaurant', preferStock: true },
          placeName: 'Kazuya Restaurant',
          city: 'Auckland'
        }),
        createActivity({
          id: 2,
          activity: 'Try Kazuya',
          image: { stock: 'kazuya restaurant', mediaKey: 'restaurant', preferStock: true },
          placeName: 'Kazuya',
          city: 'Auckland'
        })
      ]

      const result = aggregateActivities(activities)

      // "Kazuya" vs "Kazuya Restaurant" - not 95% similar, should NOT match
      expect(result).toHaveLength(2)
    })

    it('calculates correct date range', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          messages: [
            { id: 1, sender: 'Alice', timestamp: new Date('2022-01-15'), message: 'pottery' }
          ]
        }),
        createActivity({
          id: 2,
          activity: 'Pottery Class',
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          messages: [
            { id: 2, sender: 'Bob', timestamp: new Date('2023-06-20'), message: 'pottery' }
          ]
        }),
        createActivity({
          id: 3,
          activity: 'pottery classes',
          image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
          messages: [
            { id: 3, sender: 'Charlie', timestamp: new Date('2024-12-01'), message: 'pottery' }
          ]
        })
      ]

      const result = aggregateActivities(activities)

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
          image: { stock: 'sidart restaurant auckland', mediaKey: 'restaurant', preferStock: true },
          placeName: 'Sidart',
          city: 'Auckland',
          messages: [
            { id: 1, sender: 'Alice', timestamp: new Date('2022-01-01'), message: 'Try Sidart' }
          ]
        }),
        createActivity({
          id: 2,
          activity: 'dinner at Sidart',
          image: { stock: 'sidart restaurant auckland', mediaKey: 'restaurant', preferStock: true },
          placeName: 'Sidart',
          city: 'Auckland',
          messages: [
            { id: 2, sender: 'Bob', timestamp: new Date('2023-01-01'), message: 'Sidart is great' }
          ]
        }),
        createActivity({
          id: 3,
          activity: 'Dinner at sidart',
          image: { stock: 'sidart restaurant auckland', mediaKey: 'restaurant', preferStock: true },
          placeName: 'Sidart',
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

      const result = aggregateActivities(activities)

      expect(result).toHaveLength(1)
      expect(result[0]?.messages).toHaveLength(3)

      const senders = result[0]?.messages.map((m) => m.sender)
      expect(senders).toContain('Alice')
      expect(senders).toContain('Bob')
      expect(senders).toContain('Charlie')
    })

    it('averages funScore and interestingScore across merged activities', () => {
      // Scores are 0-5 scale
      const act1 = createActivity({
        id: 1,
        activity: 'pottery class',
        image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
        funScore: 4.0,
        interestingScore: 3.0
      })
      const act2 = createActivity({
        id: 2,
        activity: 'Pottery Class',
        image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
        funScore: 3.0,
        interestingScore: 2.0
      })
      const act3 = createActivity({
        id: 3,
        activity: 'pottery classes',
        image: { stock: 'pottery class', mediaKey: 'pottery', preferStock: false },
        funScore: 3.5,
        interestingScore: 2.5
      })

      const result = aggregateActivities([act1, act2, act3])

      expect(result).toHaveLength(1)
      expect(result[0]?.funScore).toBe(3.5) // (4.0 + 3.0 + 3.5) / 3 = 3.5
      expect(result[0]?.interestingScore).toBe(2.5) // (3.0 + 2.0 + 2.5) / 3 = 2.5
      // Combined score = (int * 2 + fun) / 3 = (2.5 * 2 + 3.5) / 3 = 2.8
      expect(result[0]?.score).toBe(2.8)
    })

    it('keeps first occurrence as primary when merging', () => {
      const activities = [
        createActivity({
          id: 1,
          activity: 'pottery class',
          image: { stock: 'pottery class auckland', mediaKey: 'pottery', preferStock: false },
          city: 'Auckland',
          country: 'New Zealand',
          messages: [
            { id: 1, sender: 'Alice', timestamp: new Date('2022-01-01'), message: 'pottery class' }
          ]
        }),
        createActivity({
          id: 2,
          activity: 'Pottery Class',
          image: { stock: 'pottery class wellington', mediaKey: 'pottery', preferStock: false },
          city: 'Wellington',
          country: 'New Zealand',
          messages: [
            { id: 2, sender: 'Bob', timestamp: new Date('2024-01-01'), message: 'Pottery Class' }
          ]
        })
      ]

      const result = aggregateActivities(activities)

      expect(result).toHaveLength(1)
      // First occurrence is the primary
      expect(result[0]?.activity).toBe('pottery class')
      expect(result[0]?.city).toBe('Auckland')
    })
  })

  describe('filterByMentionCount', () => {
    it('filters activities below minimum count', () => {
      const act1 = createActivity({ id: 1, activity: 'once' })
      const act2 = createTestActivity({
        activity: 'thrice',
        messages: [
          { id: 2, sender: 'A', timestamp: new Date(), message: 'thrice' },
          { id: 3, sender: 'B', timestamp: new Date(), message: 'thrice' },
          { id: 4, sender: 'C', timestamp: new Date(), message: 'thrice' }
        ]
      })
      const act3 = createTestActivity({
        activity: 'five times',
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
      // Three distinct activities with different mediaKeys - they should NOT merge
      const raw = [
        createActivity({
          id: 1,
          activity: 'Once mentioned',
          image: { stock: 'once', mediaKey: 'place', preferStock: false }
        }),
        createActivity({
          id: 2,
          activity: 'Twice mentioned',
          image: { stock: 'twice', mediaKey: 'food', preferStock: false }
        }),
        createActivity({
          id: 3,
          activity: 'twice mentioned',
          image: { stock: 'twice', mediaKey: 'food', preferStock: false }
        }),
        createActivity({
          id: 4,
          activity: 'Thrice mentioned',
          image: { stock: 'thrice', mediaKey: 'trail', preferStock: false }
        }),
        createActivity({
          id: 5,
          activity: 'thrice mentioned',
          image: { stock: 'thrice', mediaKey: 'trail', preferStock: false }
        }),
        createActivity({
          id: 6,
          activity: 'Thrice Mentioned',
          image: { stock: 'thrice', mediaKey: 'trail', preferStock: false }
        })
      ]

      const deduped = aggregateActivities(raw)
      const result = getMostWanted(deduped)

      expect(result).toHaveLength(2)
      expect(result.every((r) => getMentionCount(r) > 1)).toBe(true)
    })

    it('respects limit parameter', () => {
      // Three distinct activities that will each merge into one
      const raw = [
        createActivity({
          id: 1,
          activity: 'Activity A',
          image: { stock: 'activity a', mediaKey: 'thing-a', preferStock: false }
        }),
        createActivity({
          id: 2,
          activity: 'activity a',
          image: { stock: 'activity a', mediaKey: 'thing-a', preferStock: false }
        }),
        createActivity({
          id: 3,
          activity: 'Activity B',
          image: { stock: 'activity b', mediaKey: 'thing-b', preferStock: false }
        }),
        createActivity({
          id: 4,
          activity: 'activity b',
          image: { stock: 'activity b', mediaKey: 'thing-b', preferStock: false }
        }),
        createActivity({
          id: 5,
          activity: 'Activity C',
          image: { stock: 'activity c', mediaKey: 'thing-c', preferStock: false }
        }),
        createActivity({
          id: 6,
          activity: 'activity c',
          image: { stock: 'activity c', mediaKey: 'thing-c', preferStock: false }
        })
      ]

      const deduped = aggregateActivities(raw)
      const result = getMostWanted(deduped, 2)

      expect(result).toHaveLength(2)
    })
  })
})
