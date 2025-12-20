/**
 * Test Support Module
 *
 * Utilities for testing that require special handling of external dependencies.
 */

import type { GeocodedSuggestion } from '../types/geocoder.js'
import type { ActivityCategory, ClassifiedSuggestion } from '../types.js'

export { FixtureCache } from './fixture-cache.js'

/**
 * Create a ClassifiedSuggestion with default values for testing.
 * Only requires the fields that vary between tests.
 */
export function createSuggestion(
  overrides: Partial<ClassifiedSuggestion> & {
    messageId: number
    activity: string
  }
): ClassifiedSuggestion {
  return {
    isActivity: true,
    activityScore: 0.8,
    category: 'other' as ActivityCategory,
    confidence: 0.9,
    originalMessage: overrides.activity,
    sender: 'Test User',
    timestamp: new Date('2025-01-01'),
    isGeneric: true,
    isComplete: true,
    action: null,
    actionOriginal: null,
    object: null,
    objectOriginal: null,
    venue: null,
    city: null,
    state: null,
    country: null,
    ...overrides
  }
}

/**
 * Create a GeocodedSuggestion with default values for testing.
 */
export function createGeocodedSuggestion(
  overrides: Partial<GeocodedSuggestion> & {
    messageId: number
    activity: string
  }
): GeocodedSuggestion {
  return {
    ...createSuggestion(overrides),
    latitude: undefined,
    longitude: undefined,
    ...overrides
  }
}
