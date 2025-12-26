/**
 * Classify Command Tests
 *
 * Tests for the classify command output formatting functions.
 */

import { describe, expect, it } from 'vitest'
import { LATEST_GOOGLE_SMALL } from '../../classifier/models'
import { createActivity } from '../../test-support'
import type { ClassifiedActivity } from '../../types'
import {
  buildClassifyOutput,
  type ClassifyOutput,
  type ClassifyOutputActivity,
  toOutputActivity
} from './classify'

describe('toOutputActivity', () => {
  it('maps all ClassifiedActivity fields to output format', () => {
    const activity: ClassifiedActivity = createActivity({
      activity: 'hike in Karangahake Gorge',
      funScore: 0.9,
      interestingScore: 0.8,
      category: 'nature',
      confidence: 0.95,
      messages: [
        {
          id: 123,
          sender: 'John Smith',
          timestamp: new Date('2024-10-11T01:34:03.000Z'),
          message: 'We should do the Karangahake Gorge hike!'
        }
      ],
      isCompound: false,
      action: 'hike',
      actionOriginal: 'hike',
      object: null,
      objectOriginal: null,
      venue: 'Karangahake Gorge',
      city: null,
      region: null,
      country: 'New Zealand'
    })

    const output: ClassifyOutputActivity = toOutputActivity(activity)

    expect(output.activity).toBe('hike in Karangahake Gorge')
    expect(output.category).toBe('nature')
    expect(output.messages).toHaveLength(1)
    expect(output.messages[0]?.sender).toBe('John Smith')
    expect(output.messages[0]?.timestamp).toBe('2024-10-11T01:34:03.000Z')
    expect(output.messages[0]?.message).toBe('We should do the Karangahake Gorge hike!')
    expect(output.mentionCount).toBe(1)
    expect(output.action).toBe('hike')
    expect(output.actionOriginal).toBe('hike')
    expect(output.object).toBeNull()
    expect(output.objectOriginal).toBeNull()
    expect(output.venue).toBe('Karangahake Gorge')
    expect(output.city).toBeNull()
    expect(output.region).toBeNull()
    expect(output.country).toBe('New Zealand')
    expect(output.isCompound).toBe(false)
    expect(output.interestingScore).toBe(0.8)
    expect(output.funScore).toBe(0.9)
  })

  it('converts Date timestamp to ISO string', () => {
    const activity: ClassifiedActivity = createActivity({
      activity: 'test',
      messages: [
        {
          id: 1,
          sender: 'Test User',
          timestamp: new Date('2025-01-15T10:30:00.000Z'),
          message: 'test'
        }
      ]
    })

    const output = toOutputActivity(activity)

    expect(output.messages[0]?.timestamp).toBe('2025-01-15T10:30:00.000Z')
  })

  it('includes action and object when present', () => {
    const activity: ClassifiedActivity = createActivity({
      activity: 'watch a movie',
      category: 'entertainment',
      messages: [
        {
          id: 2,
          sender: 'User',
          timestamp: new Date(),
          message: "Let's watch a movie"
        }
      ],
      action: 'watch',
      actionOriginal: 'watch',
      object: 'movie',
      objectOriginal: 'movie'
    })

    const output = toOutputActivity(activity)

    expect(output.action).toBe('watch')
    expect(output.object).toBe('movie')
  })

  it('handles multiple messages (merged duplicates)', () => {
    const activity: ClassifiedActivity = createActivity({
      activity: 'go hiking',
      messages: [
        { id: 1, sender: 'Alice', timestamp: new Date('2024-01-01'), message: 'lets hike' },
        { id: 2, sender: 'Bob', timestamp: new Date('2024-06-01'), message: 'hiking?' },
        { id: 3, sender: 'Charlie', timestamp: new Date('2024-12-01'), message: 'hike time' }
      ]
    })

    const output = toOutputActivity(activity)

    expect(output.messages).toHaveLength(3)
    expect(output.mentionCount).toBe(3)
    expect(output.messages[0]?.sender).toBe('Alice')
    expect(output.messages[1]?.sender).toBe('Bob')
    expect(output.messages[2]?.sender).toBe('Charlie')
  })
})

describe('buildClassifyOutput', () => {
  it('builds complete output from stats and activities', () => {
    const stats = {
      candidatesClassified: 10,
      activitiesFound: 5,
      model: LATEST_GOOGLE_SMALL,
      provider: 'google'
    }

    const activities: ClassifiedActivity[] = [
      createActivity({
        activity: 'hike in the mountains',
        funScore: 0.9,
        interestingScore: 0.8,
        category: 'nature',
        confidence: 0.95,
        messages: [
          {
            id: 1,
            sender: 'Bob',
            timestamp: new Date('2025-01-10T09:00:00.000Z'),
            message: "Let's go hiking"
          }
        ],
        action: 'hike',
        actionOriginal: 'hiking',
        region: 'Alps',
        country: 'Switzerland'
      })
    ]

    const output: ClassifyOutput = buildClassifyOutput(stats, activities)

    expect(output.candidatesClassified).toBe(10)
    expect(output.activitiesFound).toBe(5)
    expect(output.model).toBe(LATEST_GOOGLE_SMALL)
    expect(output.provider).toBe('google')
    expect(output.activities).toHaveLength(1)
    expect(output.activities[0]?.action).toBe('hike')
    expect(output.activities[0]?.actionOriginal).toBe('hiking')
  })

  it('maps multiple activities', () => {
    const stats = {
      candidatesClassified: 20,
      activitiesFound: 2,
      model: 'haiku-4.5',
      provider: 'anthropic'
    }

    const activities: ClassifiedActivity[] = [
      createActivity({
        activity: 'activity one',
        messages: [{ id: 1, sender: 'A', timestamp: new Date(), message: 'msg 1' }]
      }),
      createActivity({
        activity: 'activity two',
        category: 'food',
        messages: [{ id: 2, sender: 'B', timestamp: new Date(), message: 'msg 2' }],
        action: 'eat',
        actionOriginal: 'eat',
        venue: 'Some Restaurant',
        city: 'Auckland',
        country: 'New Zealand'
      })
    ]

    const output: ClassifyOutput = buildClassifyOutput(stats, activities)

    expect(output.activities).toHaveLength(2)
    expect(output.activities[0]?.activity).toBe('activity one')
    expect(output.activities[1]?.activity).toBe('activity two')
    expect(output.activities[1]?.venue).toBe('Some Restaurant')
  })
})
