/**
 * Test Support Module
 *
 * Utilities for testing that require special handling of external dependencies.
 */

import {
  type ActivityCategory,
  type ActivityMessage,
  type CandidateMessage,
  type ClassifiedActivity,
  calculateCombinedScore
} from '../types'
import { generateActivityId } from '../types/activity-id'
import type { GeocodedActivity } from '../types/geocoder'

export { FixtureCache } from './fixture-cache'

/**
 * Create a CandidateMessage with default values for testing.
 */
export function createCandidate(
  overrides: Partial<CandidateMessage> & {
    messageId: number
    content: string
  }
): CandidateMessage {
  return {
    sender: 'Test User',
    timestamp: new Date('2025-01-01'),
    source: { type: 'regex', pattern: 'test_pattern' },
    confidence: 0.8,
    candidateType: 'suggestion',
    contextBefore: [],
    contextAfter: [],
    ...overrides
  }
}

/**
 * Create a ClassifiedActivity with default values for testing.
 *
 * Either provide `messages` array directly, or the helper will create
 * a default single-message array using the `activity` text.
 */
export function createActivity(
  overrides: Partial<ClassifiedActivity> & {
    activity: string
  }
): ClassifiedActivity {
  const { activity, activityId: providedId, messages: providedMessages, ...rest } = overrides

  // Scores are 0-5 scale
  const funScore = (rest as Partial<ClassifiedActivity>).funScore ?? 3.5
  const interestingScore = (rest as Partial<ClassifiedActivity>).interestingScore ?? 2.5
  const score =
    (rest as Partial<ClassifiedActivity>).score ??
    calculateCombinedScore(funScore, interestingScore)

  // Use provided messages or create a default single-message array
  const messages: readonly ActivityMessage[] = providedMessages ?? [
    {
      id: 1,
      timestamp: new Date('2025-01-01'),
      sender: 'Test User',
      message: activity
    }
  ]

  const base = {
    activity,
    funScore,
    interestingScore,
    score,
    category: 'other' as ActivityCategory,
    confidence: 0.9,
    messages,
    isCompound: false,
    action: 'do',
    actionOriginal: 'do',
    object: null,
    objectOriginal: null,
    venue: null,
    city: null,
    region: null,
    country: null,
    imageKeywords: [],
    ...rest
  }

  // Generate deterministic ID from all fields
  const activityId = providedId ?? generateActivityId(base)

  return { activityId, ...base }
}

/**
 * Create a GeocodedActivity with default values for testing.
 */
export function createGeocodedActivity(
  overrides: Partial<GeocodedActivity> & {
    activity: string
  }
): GeocodedActivity {
  return {
    ...createActivity(overrides),
    latitude: undefined,
    longitude: undefined,
    ...overrides
  }
}
