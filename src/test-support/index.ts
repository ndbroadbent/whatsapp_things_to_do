/**
 * Test Support Module
 *
 * Utilities for testing that require special handling of external dependencies.
 */

import type { ActivityCategory, CandidateMessage, ClassifiedActivity } from '../types'
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
 * Only requires the fields that vary between tests.
 */
export function createActivity(
  overrides: Partial<ClassifiedActivity> & {
    messageId: number
    activity: string
  }
): ClassifiedActivity {
  const { messageId, activity, activityId: providedId, ...rest } = overrides

  const base = {
    messageId,
    activity,
    funScore: 0.7,
    interestingScore: 0.5,
    category: 'other' as ActivityCategory,
    confidence: 0.9,
    originalMessage: activity,
    sender: 'Test User',
    timestamp: new Date('2025-01-01'),
    isGeneric: true,
    isCompound: false,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city: null,
    region: null,
    country: null,
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
    messageId: number
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
