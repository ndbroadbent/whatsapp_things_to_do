/**
 * Tests for semantic clustering
 *
 * Clustering groups activities by matching normalized fields:
 * - image.mediaKey (e.g., "hiking", "restaurant")
 * - placeName or placeQuery
 * - city, country
 *
 * The clustering key is: `mediaKey|place|city|country` (case-insensitive)
 */

import { describe, expect, it } from 'vitest'
import { createActivity as createTestActivity } from '../test-support'
import type { ClassifiedActivity } from '../types/classifier'
import { clusterActivities } from './index'

/**
 * Helper to create a ClassifiedActivity for testing.
 */
function createActivity(
  activity: string,
  overrides: Partial<ClassifiedActivity> = {}
): ClassifiedActivity {
  return createTestActivity({
    activity,
    ...overrides
  })
}

describe('clusterActivities', () => {
  describe('basic clustering by normalized fields', () => {
    it('should cluster activities with identical mediaKey', () => {
      const activities = [
        createActivity('Go hiking', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false }
        }),
        createActivity('Go tramping', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false }
        }),
        createActivity('Do a hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false }
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.filtered.length).toBe(0)
    })

    it('should keep different activities in separate clusters', () => {
      const activities = [
        createActivity('Go biking', {
          image: { stock: 'biking', mediaKey: 'cycling', preferStock: false }
        }),
        createActivity('Go swimming', {
          image: { stock: 'swimming', mediaKey: 'swimming', preferStock: false }
        }),
        createActivity('Visit a restaurant', {
          image: { stock: 'restaurant', mediaKey: 'restaurant', preferStock: false }
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(3)
      expect(result.clusters.every((c) => c.instanceCount === 1)).toBe(true)
    })

    it('should NOT cluster same mediaKey with different cities', () => {
      const activities = [
        createActivity('Go hiking', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          city: 'Auckland'
        }),
        createActivity('Go hiking', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          city: 'Wellington'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
    })
  })

  describe('location handling', () => {
    it('should NOT cluster same activity with different countries', () => {
      const activities = [
        createActivity('Go kayaking', {
          image: { stock: 'kayaking', mediaKey: 'kayaking', preferStock: false }
        }),
        createActivity('Go kayaking in Mexico', {
          image: { stock: 'kayaking mexico', mediaKey: 'kayaking', preferStock: true },
          country: 'Mexico'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
    })

    it('should cluster same activity with same city', () => {
      const activities = [
        createActivity('Hike in Queenstown', {
          image: { stock: 'hiking queenstown', mediaKey: 'hiking', preferStock: true },
          city: 'Queenstown'
        }),
        createActivity('Go hiking in Queenstown', {
          image: { stock: 'hiking queenstown', mediaKey: 'hiking', preferStock: true },
          city: 'Queenstown'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should NOT cluster different cities for same mediaKey', () => {
      const activities = [
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          city: 'Queenstown'
        }),
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          city: 'Auckland'
        }),
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          city: 'Wellington'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(3)
    })
  })

  describe('placeName handling', () => {
    it('should cluster by placeName', () => {
      const activities = [
        createActivity('Visit Eiffel Tower', {
          image: { stock: 'eiffel tower paris', mediaKey: 'landmark', preferStock: true },
          placeName: 'Eiffel Tower',
          city: 'Paris'
        }),
        createActivity('Go to the Eiffel Tower', {
          image: { stock: 'eiffel tower paris', mediaKey: 'landmark', preferStock: true },
          placeName: 'Eiffel Tower',
          city: 'Paris'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should NOT cluster different placeNames in same city', () => {
      const activities = [
        createActivity('Visit Louvre', {
          image: { stock: 'louvre museum', mediaKey: 'museum', preferStock: true },
          placeName: 'Louvre Museum',
          city: 'Paris'
        }),
        createActivity('Visit Eiffel Tower', {
          image: { stock: 'eiffel tower', mediaKey: 'landmark', preferStock: true },
          placeName: 'Eiffel Tower',
          city: 'Paris'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
    })
  })

  describe('placeQuery handling', () => {
    it('should cluster by placeQuery when placeName is null', () => {
      const activities = [
        createActivity('Visit The Coffee Club', {
          image: { stock: 'coffee shop auckland', mediaKey: 'cafe', preferStock: true },
          placeQuery: 'The Coffee Club Auckland',
          city: 'Auckland'
        }),
        createActivity('Go to Coffee Club', {
          image: { stock: 'coffee shop auckland', mediaKey: 'cafe', preferStock: true },
          placeQuery: 'The Coffee Club Auckland',
          city: 'Auckland'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })
  })

  describe('case insensitivity', () => {
    it('should cluster case-insensitively', () => {
      const activities = [
        createActivity('GO HIKING', {
          image: { stock: 'hiking', mediaKey: 'HIKING', preferStock: false }
        }),
        createActivity('go hiking', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false }
        }),
        createActivity('Go Hiking', {
          image: { stock: 'hiking', mediaKey: 'Hiking', preferStock: false }
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })
  })

  describe('cluster metadata', () => {
    it('should select highest-scoring activity as representative', () => {
      const activities = [
        createActivity('Hike 1', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          score: 3.0
        }),
        createActivity('Hike 2', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          score: 4.5
        }),
        createActivity('Hike 3', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          score: 3.8
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.representative.activity).toBe('Hike 2')
      expect(result.clusters[0]?.representative.score).toBe(4.5)
    })

    it('should track all unique senders', () => {
      const activities = [
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          messages: [{ id: 1, sender: 'Alice', timestamp: new Date(), message: 'Hike' }]
        }),
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          messages: [{ id: 2, sender: 'Bob', timestamp: new Date(), message: 'Hike' }]
        }),
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          messages: [{ id: 3, sender: 'Alice', timestamp: new Date(), message: 'Hike again' }]
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.allSenders).toContain('Alice')
      expect(result.clusters[0]?.allSenders).toContain('Bob')
      expect(result.clusters[0]?.allSenders.length).toBe(2) // Unique senders
    })

    it('should calculate date range from all messages', () => {
      const activities = [
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          messages: [{ id: 1, sender: 'A', timestamp: new Date('2024-01-15'), message: 'Hike' }]
        }),
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          messages: [{ id: 2, sender: 'B', timestamp: new Date('2024-06-20'), message: 'Hike' }]
        }),
        createActivity('Hike', {
          image: { stock: 'hiking', mediaKey: 'hiking', preferStock: false },
          messages: [{ id: 3, sender: 'C', timestamp: new Date('2024-03-10'), message: 'Hike' }]
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters[0]?.firstMentioned).toEqual(new Date('2024-01-15'))
      expect(result.clusters[0]?.lastMentioned).toEqual(new Date('2024-06-20'))
    })
  })

  describe('sorting', () => {
    it('should sort clusters by instance count (descending)', () => {
      const activities = [
        createActivity('Unique', {
          image: { stock: 'unique', mediaKey: 'unique', preferStock: false }
        }),
        createActivity('Popular 1', {
          image: { stock: 'popular', mediaKey: 'popular', preferStock: false }
        }),
        createActivity('Popular 2', {
          image: { stock: 'popular', mediaKey: 'popular', preferStock: false }
        }),
        createActivity('Popular 3', {
          image: { stock: 'popular', mediaKey: 'popular', preferStock: false }
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.clusters[1]?.instanceCount).toBe(1)
    })
  })

  describe('empty input', () => {
    it('should return empty result for empty input', () => {
      const result = clusterActivities([])

      expect(result.clusters.length).toBe(0)
      expect(result.filtered.length).toBe(0)
    })
  })

  describe('null mediaKey handling', () => {
    it('should cluster activities with null mediaKey together when other fields match', () => {
      const activities = [
        createActivity('Generic activity', {
          image: { stock: 'something', mediaKey: null, preferStock: false },
          city: 'Auckland'
        }),
        createActivity('Another generic activity', {
          image: { stock: 'something else', mediaKey: null, preferStock: false },
          city: 'Auckland'
        })
      ]

      const result = clusterActivities(activities)

      // Both have null mediaKey, null placeName/placeQuery, same city, null country
      // Key: "|auckland|"
      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })
  })
})
