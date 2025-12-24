/**
 * Classify Command Tests
 *
 * Tests for the classify command output formatting functions.
 */

import { describe, expect, it } from 'vitest'
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
      messageId: 123,
      activity: 'hike in Karangahake Gorge',
      funScore: 0.9,
      interestingScore: 0.8,
      category: 'nature',
      confidence: 0.95,
      originalMessage: 'We should do the Karangahake Gorge hike!',
      sender: 'John Smith',
      timestamp: new Date('2024-10-11T01:34:03.000Z'),
      isGeneric: false,
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
    expect(output.sender).toBe('John Smith')
    expect(output.timestamp).toBe('2024-10-11T01:34:03.000Z')
    expect(output.action).toBe('hike')
    expect(output.actionOriginal).toBe('hike')
    expect(output.object).toBeNull()
    expect(output.objectOriginal).toBeNull()
    expect(output.venue).toBe('Karangahake Gorge')
    expect(output.city).toBeNull()
    expect(output.region).toBeNull()
    expect(output.country).toBe('New Zealand')
    expect(output.isGeneric).toBe(false)
    expect(output.isCompound).toBe(false)
    expect(output.interestingScore).toBe(0.8)
    expect(output.funScore).toBe(0.9)
  })

  it('converts Date timestamp to ISO string', () => {
    const activity: ClassifiedActivity = createActivity({
      messageId: 1,
      activity: 'test',
      timestamp: new Date('2025-01-15T10:30:00.000Z')
    })

    const output = toOutputActivity(activity)

    expect(output.timestamp).toBe('2025-01-15T10:30:00.000Z')
  })

  it('includes action and object when present', () => {
    const activity: ClassifiedActivity = createActivity({
      messageId: 2,
      activity: 'watch a movie',
      category: 'entertainment',
      originalMessage: "Let's watch a movie",
      action: 'watch',
      actionOriginal: 'watch',
      object: 'movie',
      objectOriginal: 'movie'
    })

    const output = toOutputActivity(activity)

    expect(output.action).toBe('watch')
    expect(output.object).toBe('movie')
  })
})

describe('buildClassifyOutput', () => {
  it('builds complete output from stats and activities', () => {
    const stats = {
      candidatesClassified: 10,
      activitiesFound: 5,
      model: 'gemini-2.5-flash',
      provider: 'openrouter'
    }

    const activities: ClassifiedActivity[] = [
      createActivity({
        messageId: 1,
        activity: 'hike in the mountains',
        funScore: 0.9,
        interestingScore: 0.8,
        category: 'nature',
        confidence: 0.95,
        originalMessage: "Let's go hiking",
        sender: 'Bob',
        timestamp: new Date('2025-01-10T09:00:00.000Z'),
        isGeneric: false,
        action: 'hike',
        actionOriginal: 'hiking',
        region: 'Alps',
        country: 'Switzerland'
      })
    ]

    const output: ClassifyOutput = buildClassifyOutput(stats, activities)

    expect(output.candidatesClassified).toBe(10)
    expect(output.activitiesFound).toBe(5)
    expect(output.model).toBe('gemini-2.5-flash')
    expect(output.provider).toBe('openrouter')
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
        messageId: 1,
        activity: 'activity one',
        originalMessage: 'msg 1',
        sender: 'A'
      }),
      createActivity({
        messageId: 2,
        activity: 'activity two',
        category: 'food',
        originalMessage: 'msg 2',
        sender: 'B',
        isGeneric: false,
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
