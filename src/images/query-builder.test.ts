/**
 * Stock Image Query Builder Tests
 */

import { describe, expect, it } from 'vitest'
import { createGeocodedActivity } from '../test-support'
import { buildStockImageQuery } from './query-builder'

describe('buildStockImageQuery', () => {
  it('builds query from action and object', () => {
    const activity = createGeocodedActivity({
      activity: 'Go hiking in mountains',
      action: 'go hiking',
      object: 'mountains'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBe('go hiking mountains')
  })

  it('includes location (venue first)', () => {
    const activity = createGeocodedActivity({
      activity: 'Visit Eiffel Tower',
      action: 'visit',
      venue: 'Eiffel Tower',
      city: 'Paris',
      country: 'France'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toContain('Eiffel Tower')
    expect(query).not.toContain('Paris') // venue takes precedence
  })

  it('falls back to city when no venue', () => {
    const activity = createGeocodedActivity({
      activity: 'Explore Tokyo',
      action: 'explore',
      venue: null,
      city: 'Tokyo',
      country: 'Japan'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toContain('Tokyo')
    expect(query).not.toContain('Japan') // city takes precedence
  })

  it('includes imageKeywords', () => {
    const activity = createGeocodedActivity({
      activity: 'Go trip to Bay of Islands',
      action: 'go trip',
      city: 'Bay of Islands',
      imageKeywords: ['coast', 'beach', 'ocean']
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBe('go trip Bay of Islands coast beach ocean')
  })

  it('falls back to category when no other fields', () => {
    const activity = createGeocodedActivity({
      activity: 'Food activity',
      action: null,
      object: null,
      venue: null,
      city: null,
      region: null,
      country: null,
      imageKeywords: [],
      category: 'food'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBe('food')
  })

  it('returns null when no meaningful fields and category is other', () => {
    const activity = createGeocodedActivity({
      activity: 'Other activity',
      action: null,
      object: null,
      venue: null,
      city: null,
      region: null,
      country: null,
      imageKeywords: [],
      category: 'other'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBeNull()
  })

  it('truncates query to max length', () => {
    const activity = createGeocodedActivity({
      activity: 'Visit place',
      action: 'visit',
      imageKeywords: Array(20)
        .fill('keyword')
        .map((k, i) => `${k}${i}`)
    })

    const query = buildStockImageQuery(activity, 50)

    expect(query?.length).toBeLessThanOrEqual(50)
  })

  it('uses default max length of 100', () => {
    const activity = createGeocodedActivity({
      activity: 'Long activity',
      action: 'a'.repeat(150)
    })

    const query = buildStockImageQuery(activity)

    expect(query?.length).toBe(100)
  })
})
