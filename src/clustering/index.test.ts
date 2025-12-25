/**
 * Tests for semantic clustering
 *
 * The new clustering approach relies on LLM normalization at classification time.
 * The LLM normalizes synonyms (tramping→hike, cycling→bike, film→movie) and extracts
 * structured fields (action, object, venue, city, country).
 *
 * Clustering is now simple exact-match on normalized fields.
 * Simple entries (isCompound=false) cluster by fields; compound entries (isCompound=true) cluster by title.
 */

import { describe, expect, it } from 'vitest'
import { createActivity as createTestActivity } from '../test-support'
import type { ClassifiedActivity } from '../types/classifier'
import { clusterActivities } from './index'

/**
 * Helper to create a ClassifiedActivity for testing.
 * Uses the new normalized fields (action, object, venue, city, country).
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
    it('should cluster activities with identical normalized fields', () => {
      const activities = [
        createActivity('Go hiking', { action: 'hike', actionOriginal: 'hiking' }),
        createActivity('Go tramping', { action: 'hike', actionOriginal: 'tramping' }),
        createActivity('Do a hike', { action: 'hike', actionOriginal: 'hike' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.filtered.length).toBe(0)
    })

    it('should keep different activities in separate clusters', () => {
      const activities = [
        createActivity('Go biking', { action: 'bike' }),
        createActivity('Go swimming', { action: 'swim' }),
        createActivity('Visit a restaurant', { action: 'eat', object: 'restaurant' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(3)
      expect(result.clusters.every((c) => c.instanceCount === 1)).toBe(true)
    })

    it('should NOT cluster same action with different objects', () => {
      const activities = [
        createActivity('Watch a movie', { action: 'watch', object: 'movie' }),
        createActivity('Watch a show', { action: 'watch', object: 'show' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
    })
  })

  describe('location handling', () => {
    it('should NOT cluster same activity with different cities', () => {
      const activities = [
        createActivity('Go kayaking', { action: 'kayak' }),
        createActivity('Go kayaking in Mexico', { action: 'kayak', country: 'Mexico' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
    })

    it('should cluster same activity with same city', () => {
      const activities = [
        createActivity('Hike in Queenstown', { action: 'hike', city: 'Queenstown' }),
        createActivity('Go hiking in Queenstown', { action: 'hike', city: 'Queenstown' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should NOT cluster different cities for same activity', () => {
      const activities = [
        createActivity('Hike', { action: 'hike', city: 'Queenstown' }),
        createActivity('Hike', { action: 'hike', city: 'Auckland' }),
        createActivity('Hike', { action: 'hike', city: 'Wellington' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(3)
    })

    it('should cluster by venue when present', () => {
      const activities = [
        createActivity('Dinner at Coffee Lab', { action: 'eat', venue: 'Coffee Lab' }),
        createActivity('Try Coffee Lab', { action: 'eat', venue: 'Coffee Lab' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })
  })

  describe('simple vs compound handling', () => {
    it('should cluster simple entries by normalized fields', () => {
      const activities = [
        createActivity('Go hiking', { action: 'hike', isCompound: false }),
        createActivity('Go tramping', { action: 'hike', isCompound: false }),
        createActivity('Go hiking and kayaking', { action: 'hike', isCompound: true })
      ]

      const result = clusterActivities(activities)

      // 2 simple entries cluster by action, 1 compound is separate (different title)
      expect(result.clusters.length).toBe(2)
      const clusterCounts = result.clusters.map((c) => c.instanceCount).sort((a, b) => b - a)
      expect(clusterCounts).toEqual([2, 1])
    })

    it('should cluster compound entries by exact title', () => {
      const activities = [
        createActivity('Trip to Iceland and see aurora', { action: 'travel', isCompound: true }),
        createActivity('Trip to Iceland and see aurora', { action: 'travel', isCompound: true }),
        createActivity('Different Iceland trip', { action: 'travel', isCompound: true })
      ]

      const result = clusterActivities(activities)

      // 2 with same title cluster, 1 different title is separate
      expect(result.clusters.length).toBe(2)
      const clusterCounts = result.clusters.map((c) => c.instanceCount).sort((a, b) => b - a)
      expect(clusterCounts).toEqual([2, 1])
    })

    it('should not mix simple and compound entries even with same action', () => {
      const activities = [
        createActivity('Go hiking', { action: 'hike', isCompound: false }),
        createActivity('Go hiking', { action: 'hike', isCompound: true })
      ]

      const result = clusterActivities(activities)

      // Same title but different compound status = separate clusters
      expect(result.clusters.length).toBe(2)
    })
  })

  describe('no filtering', () => {
    it('should return all activities without filtering', () => {
      const activities = [
        createActivity('Try new restaurant', { action: 'eat', funScore: 0.9 }),
        createActivity('Take out trash', { action: 'chore', funScore: 0.2 })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
      expect(result.filtered.length).toBe(0)
    })
  })

  describe('representative selection', () => {
    it('should select highest confidence as representative', () => {
      const activities = [
        createActivity('Go biking', { action: 'bike', confidence: 0.7 }),
        createActivity('Ride a bike', { action: 'bike', confidence: 0.95 }),
        createActivity('Go for a bike ride', { action: 'bike', confidence: 0.8 })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters[0]?.representative.activity).toBe('Ride a bike')
    })
  })

  describe('cluster metadata', () => {
    it('should calculate correct date range', () => {
      const earlyDate = new Date('2025-01-01')
      const lateDate = new Date('2025-12-31')

      const activities = [
        createActivity('Go biking', {
          action: 'bike',
          messages: [
            { id: 1, sender: 'User', timestamp: new Date('2025-06-15'), message: 'biking' }
          ]
        }),
        createActivity('Ride a bike', {
          action: 'bike',
          messages: [{ id: 2, sender: 'User', timestamp: earlyDate, message: 'ride' }]
        }),
        createActivity('Go for a bike ride', {
          action: 'bike',
          messages: [{ id: 3, sender: 'User', timestamp: lateDate, message: 'ride' }]
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters[0]?.firstMentioned.getTime()).toBe(earlyDate.getTime())
      expect(result.clusters[0]?.lastMentioned.getTime()).toBe(lateDate.getTime())
    })

    it('should collect all unique senders', () => {
      const activities = [
        createActivity('Go biking', {
          action: 'bike',
          messages: [{ id: 1, sender: 'Alice', timestamp: new Date(), message: 'biking' }]
        }),
        createActivity('Ride a bike', {
          action: 'bike',
          messages: [{ id: 2, sender: 'Bob', timestamp: new Date(), message: 'ride' }]
        }),
        createActivity('Go for a bike ride', {
          action: 'bike',
          messages: [{ id: 3, sender: 'Alice', timestamp: new Date(), message: 'ride' }]
        })
      ]

      const result = clusterActivities(activities)

      const cluster = result.clusters[0]
      expect(cluster?.allSenders).toHaveLength(2)
      expect(cluster?.allSenders).toContain('Alice')
      expect(cluster?.allSenders).toContain('Bob')
    })

    it('should include cluster key', () => {
      const activities = [
        createActivity('Hike in Queenstown', {
          action: 'hike',
          city: 'Queenstown',
          country: 'New Zealand'
        })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters[0]?.clusterKey).toBe('hike|||queenstown|new zealand')
    })
  })

  describe('sorting', () => {
    it('should sort clusters by instance count descending', () => {
      const activities = [
        createActivity('Go swimming', { action: 'swim' }),
        createActivity('Go biking', { action: 'bike' }),
        createActivity('Ride a bike', { action: 'bike' }),
        createActivity('Go for a bike ride', { action: 'bike' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters[0]?.instanceCount).toBe(3)
      expect(result.clusters[1]?.instanceCount).toBe(1)
    })

    it('should sort by first mentioned when instance counts are equal', () => {
      const activities = [
        createActivity('Go swimming', {
          action: 'swim',
          messages: [{ id: 1, sender: 'User', timestamp: new Date('2025-06-01'), message: 'swim' }]
        }),
        createActivity('Go biking', {
          action: 'bike',
          messages: [{ id: 2, sender: 'User', timestamp: new Date('2025-01-01'), message: 'bike' }]
        })
      ]

      const result = clusterActivities(activities)

      // Earlier date comes first when counts are equal
      expect(result.clusters[0]?.representative.activity).toBe('Go biking')
      expect(result.clusters[1]?.representative.activity).toBe('Go swimming')
    })
  })

  describe('case insensitivity', () => {
    it('should cluster regardless of case in normalized fields', () => {
      const activities = [
        createActivity('Go hiking', { action: 'hike', city: 'Queenstown' }),
        createActivity('Go tramping', { action: 'Hike', city: 'QUEENSTOWN' }),
        createActivity('Do a hike', { action: 'HIKE', city: 'queenstown' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })
  })

  describe('real-world examples', () => {
    it('should cluster normalized movie synonyms', () => {
      // LLM normalizes "film" to "movie" at classification time
      const activities = [
        createActivity('Watch a movie', { action: 'watch', object: 'movie' }),
        createActivity('Watch a film', { action: 'watch', object: 'movie' }) // LLM normalized
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(2)
    })

    it('should cluster normalized hiking synonyms', () => {
      // LLM normalizes "tramping" and "trekking" to "hike" at classification time
      const activities = [
        createActivity('Go hiking', { action: 'hike', actionOriginal: 'hiking' }),
        createActivity('Go tramping', { action: 'hike', actionOriginal: 'tramping' }),
        createActivity('Go trekking', { action: 'hike', actionOriginal: 'trekking' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })

    it('should cluster restaurant visits by venue', () => {
      const activities = [
        createActivity('Try Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' }),
        createActivity('Go to Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' }),
        createActivity('Dinner at Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(1)
      expect(result.clusters[0]?.instanceCount).toBe(3)
    })

    it('should NOT cluster different venues', () => {
      const activities = [
        createActivity('Try Kazuya', { action: 'eat', venue: 'Kazuya', city: 'Auckland' }),
        createActivity('Try Depot', { action: 'eat', venue: 'Depot', city: 'Auckland' })
      ]

      const result = clusterActivities(activities)

      expect(result.clusters.length).toBe(2)
    })
  })

  describe('snapshots', () => {
    /**
     * Helper with deterministic IDs and timestamps for snapshot stability.
     */
    function createDeterministicSuggestion(
      id: number,
      activity: string,
      overrides: Partial<ClassifiedActivity> & {
        sender?: string
        timestamp?: Date
      } = {}
    ): ClassifiedActivity {
      const {
        sender = 'Test User',
        timestamp = new Date('2025-01-15T10:00:00Z'),
        ...rest
      } = overrides
      return createTestActivity({
        activity,
        category: 'other',
        messages: [
          {
            id,
            sender,
            timestamp,
            message: `We should ${activity.toLowerCase()}`
          }
        ],
        ...rest
      })
    }

    it('single cluster output structure', () => {
      const activities = [
        createDeterministicSuggestion(1, 'Go hiking', {
          action: 'hike',
          actionOriginal: 'hiking',
          timestamp: new Date('2025-01-10T10:00:00Z'),
          sender: 'Alice'
        }),
        createDeterministicSuggestion(2, 'Go tramping', {
          action: 'hike',
          actionOriginal: 'tramping',
          timestamp: new Date('2025-01-20T10:00:00Z'),
          sender: 'Bob'
        })
      ]

      const result = clusterActivities(activities)

      expect(result).toMatchInlineSnapshot(`
        {
          "clusters": [
            {
              "allSenders": [
                "Alice",
                "Bob",
              ],
              "clusterKey": "hike||||",
              "firstMentioned": 2025-01-10T10:00:00.000Z,
              "instanceCount": 2,
              "instances": [
                {
                  "action": "hike",
                  "actionOriginal": "hiking",
                  "activity": "Go hiking",
                  "activityId": "fb2217e38bf85041",
                  "category": "other",
                  "city": null,
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 1,
                      "message": "We should go hiking",
                      "sender": "Alice",
                      "timestamp": 2025-01-10T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
                {
                  "action": "hike",
                  "actionOriginal": "tramping",
                  "activity": "Go tramping",
                  "activityId": "96b00e2d19b98213",
                  "category": "other",
                  "city": null,
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 2,
                      "message": "We should go tramping",
                      "sender": "Bob",
                      "timestamp": 2025-01-20T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
              ],
              "lastMentioned": 2025-01-20T10:00:00.000Z,
              "representative": {
                "action": "hike",
                "actionOriginal": "hiking",
                "activity": "Go hiking",
                "activityId": "fb2217e38bf85041",
                "category": "other",
                "city": null,
                "confidence": 0.9,
                "country": null,
                "funScore": 0.7,
                "imageKeywords": [],
                "interestingScore": 0.5,
                "isCompound": false,
                "isGeneric": false,
                "messages": [
                  {
                    "id": 1,
                    "message": "We should go hiking",
                    "sender": "Alice",
                    "timestamp": 2025-01-10T10:00:00.000Z,
                  },
                ],
                "object": null,
                "objectOriginal": null,
                "region": null,
                "score": 1.7,
                "venue": null,
              },
            },
          ],
          "filtered": [],
        }
      `)
    })

    it('multiple clusters sorted by instance count', () => {
      const activities = [
        // Cluster 1: Hiking (3 mentions)
        createDeterministicSuggestion(1, 'Go hiking', {
          action: 'hike',
          city: 'Queenstown',
          country: 'New Zealand',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          sender: 'Alice',
          confidence: 0.95
        }),
        createDeterministicSuggestion(2, 'Tramping trip', {
          action: 'hike',
          city: 'Queenstown',
          country: 'New Zealand',
          timestamp: new Date('2025-01-15T10:00:00Z'),
          sender: 'Bob',
          confidence: 0.85
        }),
        createDeterministicSuggestion(3, 'Hike the mountains', {
          action: 'hike',
          city: 'Queenstown',
          country: 'New Zealand',
          timestamp: new Date('2025-01-20T10:00:00Z'),
          sender: 'Alice',
          confidence: 0.9
        }),
        // Cluster 2: Restaurant (1 mention)
        createDeterministicSuggestion(4, 'Try Kazuya', {
          action: 'eat',
          venue: 'Kazuya',
          city: 'Auckland',
          timestamp: new Date('2025-02-01T10:00:00Z'),
          sender: 'Charlie',
          category: 'food'
        })
      ]

      const result = clusterActivities(activities)

      expect(result).toMatchInlineSnapshot(`
        {
          "clusters": [
            {
              "allSenders": [
                "Alice",
                "Bob",
              ],
              "clusterKey": "hike|||queenstown|new zealand",
              "firstMentioned": 2025-01-01T10:00:00.000Z,
              "instanceCount": 3,
              "instances": [
                {
                  "action": "hike",
                  "actionOriginal": "do",
                  "activity": "Go hiking",
                  "activityId": "f2e1514a4a4642e7",
                  "category": "other",
                  "city": "Queenstown",
                  "confidence": 0.95,
                  "country": "New Zealand",
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 1,
                      "message": "We should go hiking",
                      "sender": "Alice",
                      "timestamp": 2025-01-01T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
                {
                  "action": "hike",
                  "actionOriginal": "do",
                  "activity": "Tramping trip",
                  "activityId": "006c0e729eecd15b",
                  "category": "other",
                  "city": "Queenstown",
                  "confidence": 0.85,
                  "country": "New Zealand",
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 2,
                      "message": "We should tramping trip",
                      "sender": "Bob",
                      "timestamp": 2025-01-15T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
                {
                  "action": "hike",
                  "actionOriginal": "do",
                  "activity": "Hike the mountains",
                  "activityId": "98ec5870bdad59e1",
                  "category": "other",
                  "city": "Queenstown",
                  "confidence": 0.9,
                  "country": "New Zealand",
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 3,
                      "message": "We should hike the mountains",
                      "sender": "Alice",
                      "timestamp": 2025-01-20T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
              ],
              "lastMentioned": 2025-01-20T10:00:00.000Z,
              "representative": {
                "action": "hike",
                "actionOriginal": "do",
                "activity": "Go hiking",
                "activityId": "f2e1514a4a4642e7",
                "category": "other",
                "city": "Queenstown",
                "confidence": 0.95,
                "country": "New Zealand",
                "funScore": 0.7,
                "imageKeywords": [],
                "interestingScore": 0.5,
                "isCompound": false,
                "isGeneric": false,
                "messages": [
                  {
                    "id": 1,
                    "message": "We should go hiking",
                    "sender": "Alice",
                    "timestamp": 2025-01-01T10:00:00.000Z,
                  },
                ],
                "object": null,
                "objectOriginal": null,
                "region": null,
                "score": 1.7,
                "venue": null,
              },
            },
            {
              "allSenders": [
                "Charlie",
              ],
              "clusterKey": "eat||kazuya|auckland|",
              "firstMentioned": 2025-02-01T10:00:00.000Z,
              "instanceCount": 1,
              "instances": [
                {
                  "action": "eat",
                  "actionOriginal": "do",
                  "activity": "Try Kazuya",
                  "activityId": "1292d0214bf77cc8",
                  "category": "food",
                  "city": "Auckland",
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 4,
                      "message": "We should try kazuya",
                      "sender": "Charlie",
                      "timestamp": 2025-02-01T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": "Kazuya",
                },
              ],
              "lastMentioned": 2025-02-01T10:00:00.000Z,
              "representative": {
                "action": "eat",
                "actionOriginal": "do",
                "activity": "Try Kazuya",
                "activityId": "1292d0214bf77cc8",
                "category": "food",
                "city": "Auckland",
                "confidence": 0.9,
                "country": null,
                "funScore": 0.7,
                "imageKeywords": [],
                "interestingScore": 0.5,
                "isCompound": false,
                "isGeneric": false,
                "messages": [
                  {
                    "id": 4,
                    "message": "We should try kazuya",
                    "sender": "Charlie",
                    "timestamp": 2025-02-01T10:00:00.000Z,
                  },
                ],
                "object": null,
                "objectOriginal": null,
                "region": null,
                "score": 1.7,
                "venue": "Kazuya",
              },
            },
          ],
          "filtered": [],
        }
      `)
    })

    it('complete vs complex clustering', () => {
      const activities = [
        // Complete entries - should cluster by normalized fields
        createDeterministicSuggestion(1, 'Go hiking', {
          action: 'hike',
          isCompound: false,
          timestamp: new Date('2025-01-01T10:00:00Z'),
          sender: 'Alice'
        }),
        createDeterministicSuggestion(2, 'Tramping', {
          action: 'hike',
          isCompound: false,
          timestamp: new Date('2025-01-02T10:00:00Z'),
          sender: 'Bob'
        }),
        // Complex entry - should cluster by exact title only
        createDeterministicSuggestion(3, 'Trip to Iceland and see aurora', {
          action: 'travel',
          isCompound: true,
          timestamp: new Date('2025-01-03T10:00:00Z'),
          sender: 'Alice'
        }),
        // Another complex with same title - should cluster together
        createDeterministicSuggestion(4, 'Trip to Iceland and see aurora', {
          action: 'travel',
          isCompound: true,
          timestamp: new Date('2025-01-04T10:00:00Z'),
          sender: 'Charlie'
        })
      ]

      const result = clusterActivities(activities)

      expect(result).toMatchInlineSnapshot(`
        {
          "clusters": [
            {
              "allSenders": [
                "Alice",
                "Bob",
              ],
              "clusterKey": "hike||||",
              "firstMentioned": 2025-01-01T10:00:00.000Z,
              "instanceCount": 2,
              "instances": [
                {
                  "action": "hike",
                  "actionOriginal": "do",
                  "activity": "Go hiking",
                  "activityId": "615ec0d4cfa07d3b",
                  "category": "other",
                  "city": null,
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 1,
                      "message": "We should go hiking",
                      "sender": "Alice",
                      "timestamp": 2025-01-01T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
                {
                  "action": "hike",
                  "actionOriginal": "do",
                  "activity": "Tramping",
                  "activityId": "845495071783b67f",
                  "category": "other",
                  "city": null,
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": false,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 2,
                      "message": "We should tramping",
                      "sender": "Bob",
                      "timestamp": 2025-01-02T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
              ],
              "lastMentioned": 2025-01-02T10:00:00.000Z,
              "representative": {
                "action": "hike",
                "actionOriginal": "do",
                "activity": "Go hiking",
                "activityId": "615ec0d4cfa07d3b",
                "category": "other",
                "city": null,
                "confidence": 0.9,
                "country": null,
                "funScore": 0.7,
                "imageKeywords": [],
                "interestingScore": 0.5,
                "isCompound": false,
                "isGeneric": false,
                "messages": [
                  {
                    "id": 1,
                    "message": "We should go hiking",
                    "sender": "Alice",
                    "timestamp": 2025-01-01T10:00:00.000Z,
                  },
                ],
                "object": null,
                "objectOriginal": null,
                "region": null,
                "score": 1.7,
                "venue": null,
              },
            },
            {
              "allSenders": [
                "Alice",
                "Charlie",
              ],
              "clusterKey": "trip to iceland and see aurora",
              "firstMentioned": 2025-01-03T10:00:00.000Z,
              "instanceCount": 2,
              "instances": [
                {
                  "action": "travel",
                  "actionOriginal": "do",
                  "activity": "Trip to Iceland and see aurora",
                  "activityId": "ad2dbbe35fd29cf3",
                  "category": "other",
                  "city": null,
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": true,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 3,
                      "message": "We should trip to iceland and see aurora",
                      "sender": "Alice",
                      "timestamp": 2025-01-03T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
                {
                  "action": "travel",
                  "actionOriginal": "do",
                  "activity": "Trip to Iceland and see aurora",
                  "activityId": "ad2dbbe35fd29cf3",
                  "category": "other",
                  "city": null,
                  "confidence": 0.9,
                  "country": null,
                  "funScore": 0.7,
                  "imageKeywords": [],
                  "interestingScore": 0.5,
                  "isCompound": true,
                  "isGeneric": false,
                  "messages": [
                    {
                      "id": 4,
                      "message": "We should trip to iceland and see aurora",
                      "sender": "Charlie",
                      "timestamp": 2025-01-04T10:00:00.000Z,
                    },
                  ],
                  "object": null,
                  "objectOriginal": null,
                  "region": null,
                  "score": 1.7,
                  "venue": null,
                },
              ],
              "lastMentioned": 2025-01-04T10:00:00.000Z,
              "representative": {
                "action": "travel",
                "actionOriginal": "do",
                "activity": "Trip to Iceland and see aurora",
                "activityId": "ad2dbbe35fd29cf3",
                "category": "other",
                "city": null,
                "confidence": 0.9,
                "country": null,
                "funScore": 0.7,
                "imageKeywords": [],
                "interestingScore": 0.5,
                "isCompound": true,
                "isGeneric": false,
                "messages": [
                  {
                    "id": 3,
                    "message": "We should trip to iceland and see aurora",
                    "sender": "Alice",
                    "timestamp": 2025-01-03T10:00:00.000Z,
                  },
                ],
                "object": null,
                "objectOriginal": null,
                "region": null,
                "score": 1.7,
                "venue": null,
              },
            },
          ],
          "filtered": [],
        }
      `)
    })
  })
})
