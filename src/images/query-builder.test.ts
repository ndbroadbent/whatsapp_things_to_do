/**
 * Stock Image Query Builder Tests
 */

import { describe, expect, it } from 'vitest'
import { createGeocodedActivity } from '../test-support'
import { buildStockImageQuery } from './query-builder'

describe('buildStockImageQuery', () => {
  it('returns the image.stock query from activity', () => {
    const activity = createGeocodedActivity({
      activity: 'Go hiking in mountains',
      image: { stock: 'hiking mountains sunrise', mediaKey: 'hiking', preferStock: true }
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBe('hiking mountains sunrise')
  })

  it('falls back to category when stock query is empty', () => {
    const activity = createGeocodedActivity({
      activity: 'Food activity',
      image: { stock: '', mediaKey: null, preferStock: false },
      category: 'food'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBe('food')
  })

  it('returns null when no stock query and category is other', () => {
    const activity = createGeocodedActivity({
      activity: 'Other activity',
      image: { stock: '', mediaKey: null, preferStock: false },
      category: 'other'
    })

    const query = buildStockImageQuery(activity)

    expect(query).toBeNull()
  })

  it('truncates query to max length', () => {
    const longQuery = 'a'.repeat(150)
    const activity = createGeocodedActivity({
      activity: 'Long activity',
      image: { stock: longQuery, mediaKey: null, preferStock: false }
    })

    const query = buildStockImageQuery(activity, 50)

    expect(query?.length).toBe(50)
  })

  it('uses default max length of 100', () => {
    const longQuery = 'a'.repeat(150)
    const activity = createGeocodedActivity({
      activity: 'Long activity',
      image: { stock: longQuery, mediaKey: null, preferStock: false }
    })

    const query = buildStockImageQuery(activity)

    expect(query?.length).toBe(100)
  })
})
