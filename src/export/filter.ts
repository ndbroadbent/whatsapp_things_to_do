/**
 * Export Filtering Module
 *
 * Shared filtering logic for all export formats (CSV, Excel, JSON, Map, PDF).
 * Provides a single code path for filtering, sorting, and limiting activities.
 */

import countries from 'i18n-iso-countries'
import en from 'i18n-iso-countries/langs/en.json'
import type { GeocodedActivity, SortOrder } from '../types'
import { isMappable } from '../types'

// Register English locale for country name lookups
countries.registerLocale(en)

// Re-export SortOrder for convenience
export type { SortOrder }

/**
 * Options for filtering activities before export.
 * All fields are optional - only specified filters are applied.
 */
export interface FilterOptions {
  /** Filter by categories (exact match, case-insensitive) */
  readonly categories?: readonly string[]
  /** Filter by countries (name or ISO code, case-insensitive) */
  readonly countries?: readonly string[]
  /** Filter by sender names (word-boundary match, case-insensitive) */
  readonly from?: readonly string[]
  /** Only activities on or after this date */
  readonly startDate?: Date
  /** Only activities on or before this date */
  readonly endDate?: Date
  /** Minimum score threshold (0-5, derived from interestingScore and funScore) */
  readonly minScore?: number
  /** Only activities with specific venue/location (at least region + country) */
  readonly onlyLocations?: boolean
  /** Only generic activities without specific locations */
  readonly onlyGeneric?: boolean
  /** Maximum number of activities to return (0 = all, applied after sort) */
  readonly maxActivities?: number
  /** Sort order when limiting (default: score) */
  readonly sort?: SortOrder
}

/**
 * Normalize a country input to a standard country name.
 * Accepts ISO alpha-2, alpha-3 codes, or country names.
 * Returns null if the input cannot be normalized.
 */
export function normalizeCountry(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Try as ISO alpha-2 code (e.g., "NZ", "US")
  const fromAlpha2 = countries.getName(trimmed.toUpperCase(), 'en')
  if (fromAlpha2) return fromAlpha2

  // Try as ISO alpha-3 code (e.g., "NZL", "USA")
  const alpha2FromAlpha3 = countries.alpha3ToAlpha2(trimmed.toUpperCase())
  if (alpha2FromAlpha3) {
    const fromAlpha3 = countries.getName(alpha2FromAlpha3, 'en')
    if (fromAlpha3) return fromAlpha3
  }

  // Try as country name - get alpha2 then back to canonical name
  const alpha2 = countries.getAlpha2Code(trimmed, 'en')
  if (alpha2) {
    return countries.getName(alpha2, 'en') ?? null
  }

  // Return original if no match (may be a partial match the user intended)
  return trimmed
}

/**
 * Check if a sender name matches the filter using word-boundary matching.
 * "John" matches "John Smith" but not "Johnson".
 */
export function matchesSender(senderName: string, filter: string): boolean {
  const filterLower = filter.toLowerCase().trim()
  const senderLower = senderName.toLowerCase()

  // Create word-boundary regex: match filter as complete word(s)
  // Escape special regex characters in filter
  const escaped = filterLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'i')
  return regex.test(senderLower)
}

/**
 * Check if an activity matches the category filter.
 */
function matchesCategory(activity: GeocodedActivity, categories: readonly string[]): boolean {
  const categoryLower = activity.category.toLowerCase()
  return categories.some((c) => c.toLowerCase() === categoryLower)
}

/**
 * Check if an activity matches the country filter.
 * Normalizes both the activity's country and filter values for comparison.
 */
function matchesCountry(activity: GeocodedActivity, countryFilters: readonly string[]): boolean {
  if (!activity.country) return false

  const activityCountry = normalizeCountry(activity.country)
  if (!activityCountry) return false

  return countryFilters.some((filter) => {
    const normalizedFilter = normalizeCountry(filter)
    if (!normalizedFilter) return false
    return activityCountry.toLowerCase() === normalizedFilter.toLowerCase()
  })
}

/**
 * Check if an activity matches the sender filter.
 * Matches any message sender against any filter value.
 */
function matchesFrom(activity: GeocodedActivity, fromFilters: readonly string[]): boolean {
  return activity.messages.some((msg) =>
    fromFilters.some((filter) => matchesSender(msg.sender, filter))
  )
}

/**
 * Check if an activity is within the date range.
 * Uses the first message timestamp.
 */
function matchesDateRange(activity: GeocodedActivity, startDate?: Date, endDate?: Date): boolean {
  const firstMessage = activity.messages[0]
  if (!firstMessage) return true // No messages = no date filter applies

  const msgDate = firstMessage.timestamp

  if (startDate && msgDate < startDate) return false
  if (endDate) {
    // End date is inclusive - set to end of day
    const endOfDay = new Date(endDate)
    endOfDay.setHours(23, 59, 59, 999)
    if (msgDate > endOfDay) return false
  }

  return true
}

/**
 * Check if an activity meets the minimum score threshold.
 * Uses the pre-computed score field (0-5 range, from calculateCombinedScore).
 */
function matchesMinScore(activity: GeocodedActivity, minScore: number): boolean {
  return activity.score >= minScore
}

/**
 * Sort activities by the specified order.
 */
function sortActivities(activities: GeocodedActivity[], order: SortOrder): GeocodedActivity[] {
  const sorted = [...activities]

  switch (order) {
    case 'score':
      // Highest score first
      sorted.sort((a, b) => b.score - a.score)
      break
    case 'oldest':
      // Oldest first (by first message timestamp)
      sorted.sort((a, b) => {
        const aTime = a.messages[0]?.timestamp.getTime() ?? 0
        const bTime = b.messages[0]?.timestamp.getTime() ?? 0
        return aTime - bTime
      })
      break
    case 'newest':
      // Newest first (by first message timestamp)
      sorted.sort((a, b) => {
        const aTime = a.messages[0]?.timestamp.getTime() ?? 0
        const bTime = b.messages[0]?.timestamp.getTime() ?? 0
        return bTime - aTime
      })
      break
  }

  return sorted
}

/**
 * Filter, sort, and limit activities based on the provided options.
 *
 * @param activities - Activities to filter
 * @param options - Filter options (all optional)
 * @returns Filtered, sorted, and limited activities
 *
 * @example
 * ```typescript
 * const filtered = filterActivities(activities, {
 *   categories: ['food', 'travel'],
 *   countries: ['NZ', 'Australia'],
 *   minScore: 1.5,
 *   maxActivities: 50,
 *   sort: 'score'
 * })
 * ```
 */
export function filterActivities(
  activities: readonly GeocodedActivity[],
  options: FilterOptions = {}
): GeocodedActivity[] {
  // Validate mutually exclusive options
  if (options.onlyLocations && options.onlyGeneric) {
    throw new Error('Cannot use both --only-locations and --only-generic (mutually exclusive)')
  }

  let result = [...activities]

  // Apply filters - capture values in local const to avoid non-null assertions
  const { categories, countries, from, startDate, endDate, minScore } = options

  if (categories && categories.length > 0) {
    result = result.filter((a) => matchesCategory(a, categories))
  }

  if (countries && countries.length > 0) {
    result = result.filter((a) => matchesCountry(a, countries))
  }

  if (from && from.length > 0) {
    result = result.filter((a) => matchesFrom(a, from))
  }

  if (startDate || endDate) {
    result = result.filter((a) => matchesDateRange(a, startDate, endDate))
  }

  if (minScore !== undefined && minScore > 0) {
    result = result.filter((a) => matchesMinScore(a, minScore))
  }

  if (options.onlyLocations) {
    result = result.filter((a) => isMappable(a))
  }

  if (options.onlyGeneric) {
    result = result.filter((a) => !isMappable(a))
  }

  // Sort
  const sortOrder = options.sort ?? 'score'
  result = sortActivities(result, sortOrder)

  // Limit
  if (options.maxActivities && options.maxActivities > 0) {
    result = result.slice(0, options.maxActivities)
  }

  return result
}
