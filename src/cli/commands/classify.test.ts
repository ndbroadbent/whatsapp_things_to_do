/**
 * Classify Command Tests
 *
 * Tests for the classify command output formatting functions.
 */

import { describe, expect, it } from 'vitest'
import type { ClassifiedActivity } from '../../types'
import {
  buildClassifyOutput,
  type ClassifyOutput,
  type ClassifyOutputActivity,
  toOutputActivity
} from './classify'

describe('toOutputActivity', () => {
  it('maps all ClassifiedActivity fields to output format', () => {
    const activity: ClassifiedActivity = {
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
    }

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
    const activity: ClassifiedActivity = {
      messageId: 1,
      activity: 'test',
      funScore: 0.5,
      interestingScore: 0.5,
      category: 'other',
      confidence: 0.5,
      originalMessage: 'test',
      sender: 'Test',
      timestamp: new Date('2025-01-15T10:30:00.000Z'),
      isGeneric: true,
      isCompound: false,
      action: null,
      actionOriginal: null,
      object: null,
      objectOriginal: null,
      venue: null,
      city: null,
      region: null,
      country: null
    }

    const output = toOutputActivity(activity)

    expect(output.timestamp).toBe('2025-01-15T10:30:00.000Z')
  })

  it('includes action and object when present', () => {
    const activity: ClassifiedActivity = {
      messageId: 2,
      activity: 'watch a movie',
      funScore: 0.7,
      interestingScore: 0.6,
      category: 'entertainment',
      confidence: 0.8,
      originalMessage: "Let's watch a movie",
      sender: 'Alice',
      timestamp: new Date('2025-01-15T10:00:00.000Z'),
      isGeneric: true,
      isCompound: false,
      action: 'watch',
      actionOriginal: 'watch',
      object: 'movie',
      objectOriginal: 'movie',
      venue: null,
      city: null,
      region: null,
      country: null
    }

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
      {
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
        isCompound: false,
        action: 'hike',
        actionOriginal: 'hiking',
        object: null,
        objectOriginal: null,
        venue: null,
        city: null,
        region: 'Alps',
        country: 'Switzerland'
      }
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
      {
        messageId: 1,
        activity: 'activity one',
        funScore: 0.5,
        interestingScore: 0.5,
        category: 'other',
        confidence: 0.5,
        originalMessage: 'msg 1',
        sender: 'A',
        timestamp: new Date(),
        isGeneric: true,
        isCompound: false,
        action: null,
        actionOriginal: null,
        object: null,
        objectOriginal: null,
        venue: null,
        city: null,
        region: null,
        country: null
      },
      {
        messageId: 2,
        activity: 'activity two',
        funScore: 0.6,
        interestingScore: 0.7,
        category: 'food',
        confidence: 0.8,
        originalMessage: 'msg 2',
        sender: 'B',
        timestamp: new Date(),
        isGeneric: false,
        isCompound: false,
        action: 'eat',
        actionOriginal: 'eat',
        object: null,
        objectOriginal: null,
        venue: 'Some Restaurant',
        city: 'Auckland',
        region: null,
        country: 'New Zealand'
      }
    ]

    const output: ClassifyOutput = buildClassifyOutput(stats, activities)

    expect(output.activities).toHaveLength(2)
    expect(output.activities[0]?.activity).toBe('activity one')
    expect(output.activities[1]?.activity).toBe('activity two')
    expect(output.activities[1]?.venue).toBe('Some Restaurant')
  })
})
