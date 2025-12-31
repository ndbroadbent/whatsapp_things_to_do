import { describe, expect, it } from 'vitest'
import { createGeocodedActivity } from '../test-support'
import type { GeocodedActivity } from '../types'
import { filterActivities, matchesSender, normalizeCountry } from './filter'

/**
 * Helper to create a test activity with common defaults.
 * Note: Don't set a default score so tests can control it via funScore/interestingScore
 */
function createTestActivity(
  overrides: Partial<GeocodedActivity> & { activity: string }
): GeocodedActivity {
  return createGeocodedActivity({
    category: 'food',
    funScore: 2.5,
    interestingScore: 2.5,
    messages: [
      {
        id: 1,
        sender: 'Test User',
        timestamp: new Date('2025-01-15T10:30:00Z'),
        message: 'Test message'
      }
    ],
    ...overrides
  })
}

describe('Filter Module', () => {
  describe('normalizeCountry', () => {
    it('normalizes ISO alpha-2 codes', () => {
      expect(normalizeCountry('NZ')).toBe('New Zealand')
      expect(normalizeCountry('nz')).toBe('New Zealand')
      expect(normalizeCountry('US')).toBe('United States of America')
      expect(normalizeCountry('AU')).toBe('Australia')
    })

    it('normalizes ISO alpha-3 codes', () => {
      expect(normalizeCountry('NZL')).toBe('New Zealand')
      expect(normalizeCountry('USA')).toBe('United States of America')
      expect(normalizeCountry('AUS')).toBe('Australia')
    })

    it('normalizes country names', () => {
      expect(normalizeCountry('New Zealand')).toBe('New Zealand')
      expect(normalizeCountry('new zealand')).toBe('New Zealand')
      expect(normalizeCountry('United States')).toBe('United States of America')
    })

    it('returns trimmed input for unknown values', () => {
      expect(normalizeCountry('  Unknown Place  ')).toBe('Unknown Place')
    })

    it('returns null for empty input', () => {
      expect(normalizeCountry('')).toBeNull()
      expect(normalizeCountry('   ')).toBeNull()
    })
  })

  describe('matchesSender', () => {
    it('matches exact name', () => {
      expect(matchesSender('John', 'John')).toBe(true)
      expect(matchesSender('john', 'John')).toBe(true)
    })

    it('matches first name in full name', () => {
      expect(matchesSender('John Smith', 'John')).toBe(true)
      expect(matchesSender('John Michael Smith', 'John')).toBe(true)
    })

    it('matches last name in full name', () => {
      expect(matchesSender('John Smith', 'Smith')).toBe(true)
    })

    it('does not match partial word', () => {
      expect(matchesSender('Johnson', 'John')).toBe(false)
      expect(matchesSender('Smithson', 'Smith')).toBe(false)
    })

    it('matches multi-word filter', () => {
      expect(matchesSender('John Smith', 'John Smith')).toBe(true)
      expect(matchesSender('Dr John Smith Jr', 'John Smith')).toBe(true)
    })

    it('is case insensitive', () => {
      expect(matchesSender('JOHN SMITH', 'john smith')).toBe(true)
      expect(matchesSender('john smith', 'JOHN')).toBe(true)
    })
  })

  describe('filterActivities', () => {
    describe('category filter', () => {
      const activities = [
        createTestActivity({ activity: 'Pizza', category: 'food' }),
        createTestActivity({ activity: 'Hiking', category: 'nature' }),
        createTestActivity({ activity: 'Concert', category: 'music' })
      ]

      it('filters by single category', () => {
        const result = filterActivities(activities, { categories: ['food'] })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Pizza')
      })

      it('filters by multiple categories', () => {
        const result = filterActivities(activities, {
          categories: ['food', 'music']
        })
        expect(result).toHaveLength(2)
        expect(result.map((a) => a.activity)).toEqual(expect.arrayContaining(['Pizza', 'Concert']))
      })

      it('is case insensitive', () => {
        const result = filterActivities(activities, { categories: ['FOOD'] })
        expect(result).toHaveLength(1)
      })

      it('returns empty for non-matching category', () => {
        const result = filterActivities(activities, { categories: ['gaming'] })
        expect(result).toHaveLength(0)
      })
    })

    describe('country filter', () => {
      const activities = [
        createTestActivity({
          activity: 'Auckland Restaurant',
          country: 'New Zealand'
        }),
        createTestActivity({
          activity: 'Sydney Cafe',
          country: 'Australia'
        }),
        createTestActivity({
          activity: 'NYC Pizza',
          country: 'United States of America'
        }),
        createTestActivity({
          activity: 'Generic Activity',
          country: null
        })
      ]

      it('filters by country name', () => {
        const result = filterActivities(activities, {
          countries: ['New Zealand']
        })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Auckland Restaurant')
      })

      it('filters by ISO alpha-2 code', () => {
        const result = filterActivities(activities, { countries: ['NZ'] })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Auckland Restaurant')
      })

      it('filters by ISO alpha-3 code', () => {
        const result = filterActivities(activities, { countries: ['AUS'] })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Sydney Cafe')
      })

      it('filters by multiple countries', () => {
        const result = filterActivities(activities, {
          countries: ['NZ', 'Australia']
        })
        expect(result).toHaveLength(2)
      })

      it('excludes activities without country', () => {
        const result = filterActivities(activities, { countries: ['NZ'] })
        expect(result.every((a) => a.country !== null)).toBe(true)
      })
    })

    describe('sender filter', () => {
      const activities = [
        createTestActivity({
          activity: 'Activity 1',
          messages: [
            {
              id: 1,
              sender: 'John Smith',
              timestamp: new Date('2025-01-01'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'Activity 2',
          messages: [
            {
              id: 2,
              sender: 'Jane Doe',
              timestamp: new Date('2025-01-02'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'Activity 3',
          messages: [
            {
              id: 3,
              sender: 'Johnson Williams',
              timestamp: new Date('2025-01-03'),
              message: 'test'
            }
          ]
        })
      ]

      it('filters by sender first name', () => {
        const result = filterActivities(activities, { from: ['John'] })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Activity 1')
      })

      it('filters by sender last name', () => {
        const result = filterActivities(activities, { from: ['Doe'] })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Activity 2')
      })

      it('does not match partial words', () => {
        // "John" should NOT match "Johnson"
        const result = filterActivities(activities, { from: ['John'] })
        expect(result).toHaveLength(1)
        expect(result[0]?.messages[0]?.sender).toBe('John Smith')
      })

      it('filters by multiple senders', () => {
        const result = filterActivities(activities, { from: ['John', 'Jane'] })
        expect(result).toHaveLength(2)
      })
    })

    describe('date filter', () => {
      const activities = [
        createTestActivity({
          activity: 'Old Activity',
          messages: [
            {
              id: 1,
              sender: 'User',
              timestamp: new Date('2024-01-15'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'Mid Activity',
          messages: [
            {
              id: 2,
              sender: 'User',
              timestamp: new Date('2024-06-15'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'Recent Activity',
          messages: [
            {
              id: 3,
              sender: 'User',
              timestamp: new Date('2024-12-15'),
              message: 'test'
            }
          ]
        })
      ]

      it('filters by start date', () => {
        const result = filterActivities(activities, {
          startDate: new Date('2024-06-01')
        })
        expect(result).toHaveLength(2)
        expect(result.map((a) => a.activity)).toEqual(
          expect.arrayContaining(['Mid Activity', 'Recent Activity'])
        )
      })

      it('filters by end date', () => {
        const result = filterActivities(activities, {
          endDate: new Date('2024-06-30')
        })
        expect(result).toHaveLength(2)
        expect(result.map((a) => a.activity)).toEqual(
          expect.arrayContaining(['Old Activity', 'Mid Activity'])
        )
      })

      it('filters by date range', () => {
        const result = filterActivities(activities, {
          startDate: new Date('2024-03-01'),
          endDate: new Date('2024-09-30')
        })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Mid Activity')
      })

      it('end date is inclusive (includes entire day)', () => {
        const result = filterActivities(activities, {
          endDate: new Date('2024-06-15')
        })
        expect(result.map((a) => a.activity)).toContain('Mid Activity')
      })
    })

    describe('score filter', () => {
      // Scores are 0-5 scale, combined score = (int*2 + fun)/3
      const activities = [
        createTestActivity({
          activity: 'Low Score',
          funScore: 1.0,
          interestingScore: 1.0
        }), // combined: 1.0
        createTestActivity({
          activity: 'Mid Score',
          funScore: 2.5,
          interestingScore: 2.5
        }), // combined: 2.5
        createTestActivity({
          activity: 'High Score',
          funScore: 4.5,
          interestingScore: 4.5
        }) // combined: 4.5
      ]

      it('filters by minimum score', () => {
        const result = filterActivities(activities, { minScore: 2.0 })
        expect(result).toHaveLength(2)
        expect(result.map((a) => a.activity)).toEqual(
          expect.arrayContaining(['Mid Score', 'High Score'])
        )
      })

      it('excludes activities below threshold', () => {
        const result = filterActivities(activities, { minScore: 3.0 })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('High Score')
      })

      it('includes all when minScore is 0', () => {
        const result = filterActivities(activities, { minScore: 0 })
        expect(result).toHaveLength(3)
      })
    })

    describe('location filters', () => {
      const activities = [
        createTestActivity({
          activity: 'Specific Place',
          placeName: 'Coffee Lab',
          city: 'Auckland',
          country: 'New Zealand'
        }),
        createTestActivity({
          activity: 'City Only',
          city: 'Wellington',
          country: 'New Zealand'
        }),
        createTestActivity({
          activity: 'Generic Activity',
          placeName: null,
          city: null,
          region: null,
          country: null
        })
      ]

      it('onlyLocations returns activities with location', () => {
        const result = filterActivities(activities, { onlyLocations: true })
        expect(result).toHaveLength(2)
        expect(result.map((a) => a.activity)).toEqual(
          expect.arrayContaining(['Specific Place', 'City Only'])
        )
      })

      it('onlyGeneric returns activities without location', () => {
        const result = filterActivities(activities, { onlyGeneric: true })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('Generic Activity')
      })

      it('throws error when both are set', () => {
        expect(() =>
          filterActivities(activities, {
            onlyLocations: true,
            onlyGeneric: true
          })
        ).toThrow('mutually exclusive')
      })
    })

    describe('sorting', () => {
      // Scores are 0-5 scale
      const activities = [
        createTestActivity({
          activity: 'Mid Score Early',
          funScore: 2.5,
          interestingScore: 2.5,
          messages: [
            {
              id: 1,
              sender: 'User',
              timestamp: new Date('2024-01-01'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'High Score Late',
          funScore: 4.5,
          interestingScore: 4.5,
          messages: [
            {
              id: 2,
              sender: 'User',
              timestamp: new Date('2024-12-01'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'Low Score Mid',
          funScore: 1.0,
          interestingScore: 1.0,
          messages: [
            {
              id: 3,
              sender: 'User',
              timestamp: new Date('2024-06-01'),
              message: 'test'
            }
          ]
        })
      ]

      it('sorts by score (default, descending)', () => {
        const result = filterActivities(activities, { sort: 'score' })
        expect(result.map((a) => a.activity)).toEqual([
          'High Score Late',
          'Mid Score Early',
          'Low Score Mid'
        ])
      })

      it('sorts by oldest first', () => {
        const result = filterActivities(activities, { sort: 'oldest' })
        expect(result.map((a) => a.activity)).toEqual([
          'Mid Score Early',
          'Low Score Mid',
          'High Score Late'
        ])
      })

      it('sorts by newest first', () => {
        const result = filterActivities(activities, { sort: 'newest' })
        expect(result.map((a) => a.activity)).toEqual([
          'High Score Late',
          'Low Score Mid',
          'Mid Score Early'
        ])
      })

      it('defaults to score sort when not specified', () => {
        const result = filterActivities(activities, {})
        expect(result.map((a) => a.activity)).toEqual([
          'High Score Late',
          'Mid Score Early',
          'Low Score Mid'
        ])
      })
    })

    describe('maxActivities', () => {
      // Scores are 0-5 scale: Activity 1 = 5.0, Activity 2 = 4.5, ... Activity 10 = 0.5
      const activities = Array.from({ length: 10 }, (_, i) =>
        createTestActivity({
          activity: `Activity ${i + 1}`,
          funScore: (10 - i) / 2,
          interestingScore: (10 - i) / 2
        })
      )

      it('limits to specified number', () => {
        const result = filterActivities(activities, { maxActivities: 3 })
        expect(result).toHaveLength(3)
      })

      it('applies limit after sorting', () => {
        const result = filterActivities(activities, {
          maxActivities: 3,
          sort: 'score'
        })
        expect(result).toHaveLength(3)
        // Should be the top 3 by score
        expect(result[0]?.activity).toBe('Activity 1')
        expect(result[1]?.activity).toBe('Activity 2')
        expect(result[2]?.activity).toBe('Activity 3')
      })

      it('returns all when maxActivities is 0', () => {
        const result = filterActivities(activities, { maxActivities: 0 })
        expect(result).toHaveLength(10)
      })

      it('returns all when maxActivities exceeds count', () => {
        const result = filterActivities(activities, { maxActivities: 100 })
        expect(result).toHaveLength(10)
      })
    })

    describe('combined filters', () => {
      // Scores are 0-5 scale
      const activities = [
        createTestActivity({
          activity: 'NZ Food High Score',
          category: 'food',
          country: 'New Zealand',
          funScore: 4.5,
          interestingScore: 4.5,
          messages: [
            {
              id: 1,
              sender: 'John Smith',
              timestamp: new Date('2024-06-15'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'NZ Food Low Score',
          category: 'food',
          country: 'New Zealand',
          funScore: 1.5,
          interestingScore: 1.5,
          messages: [
            {
              id: 2,
              sender: 'Jane Doe',
              timestamp: new Date('2024-06-15'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'AU Music',
          category: 'music',
          country: 'Australia',
          funScore: 4.0,
          interestingScore: 4.0,
          messages: [
            {
              id: 3,
              sender: 'John Smith',
              timestamp: new Date('2024-03-15'),
              message: 'test'
            }
          ]
        }),
        createTestActivity({
          activity: 'Generic Activity',
          category: 'other',
          country: null,
          funScore: 2.5,
          interestingScore: 2.5,
          messages: [
            {
              id: 4,
              sender: 'Bob Brown',
              timestamp: new Date('2024-09-15'),
              message: 'test'
            }
          ]
        })
      ]

      it('applies multiple filters together', () => {
        const result = filterActivities(activities, {
          categories: ['food'],
          countries: ['NZ'],
          minScore: 2.0
        })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('NZ Food High Score')
      })

      it('combines sender and date filters', () => {
        const result = filterActivities(activities, {
          from: ['John'],
          startDate: new Date('2024-05-01')
        })
        expect(result).toHaveLength(1)
        expect(result[0]?.activity).toBe('NZ Food High Score')
      })

      it('applies all filters then sorts and limits', () => {
        const result = filterActivities(activities, {
          countries: ['NZ', 'AU'],
          maxActivities: 2,
          sort: 'score'
        })
        expect(result).toHaveLength(2)
        expect(result[0]?.activity).toBe('NZ Food High Score')
        expect(result[1]?.activity).toBe('AU Music')
      })
    })

    describe('empty inputs', () => {
      it('returns empty array for empty input', () => {
        const result = filterActivities([], {})
        expect(result).toEqual([])
      })

      it('returns all activities with empty options', () => {
        const activities = [
          createTestActivity({ activity: 'Test 1' }),
          createTestActivity({ activity: 'Test 2' })
        ]
        const result = filterActivities(activities, {})
        expect(result).toHaveLength(2)
      })

      it('handles empty filter arrays', () => {
        const activities = [createTestActivity({ activity: 'Test' })]
        const result = filterActivities(activities, {
          categories: [],
          countries: [],
          from: []
        })
        expect(result).toHaveLength(1)
      })
    })
  })
})
