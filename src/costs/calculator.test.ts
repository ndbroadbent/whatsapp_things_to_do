/**
 * Tests for cost calculator functions
 */

import { describe, expect, it } from 'vitest'
import {
  calculateAICompletionCost,
  calculateAIInputCost,
  calculateAIOutputCost,
  calculateEmbeddingCost,
  calculateGeocodingCost,
  calculatePexelsCost,
  calculatePixabayCost,
  calculatePlacesLookupCost,
  calculatePlacesPhotoCost,
  centsToMicros,
  createAIUsageRecords,
  createEmbeddingUsageRecord,
  createGeocodingUsageRecord,
  createImageUsageRecord,
  formatMicrosAsDollars,
  groupByProvider,
  groupByResource,
  microsToCents,
  microsToDollars,
  sumUsageCosts
} from './calculator'
import type { UsageRecord } from './types'

describe('microsToCents', () => {
  it('should convert micro-dollars to cents', () => {
    expect(microsToCents(10_000)).toBe(1) // 10k micros = 1 cent
    expect(microsToCents(100_000)).toBe(10) // 100k micros = 10 cents
    expect(microsToCents(1_000_000)).toBe(100) // 1M micros = 100 cents = $1
  })

  it('should round up fractional cents', () => {
    expect(microsToCents(5_000)).toBe(1) // Round up from 0.5
    expect(microsToCents(1)).toBe(1) // Round up from 0.0001
  })

  it('should handle zero', () => {
    expect(microsToCents(0)).toBe(0)
  })
})

describe('centsToMicros', () => {
  it('should convert cents to micro-dollars', () => {
    expect(centsToMicros(1)).toBe(10_000)
    expect(centsToMicros(100)).toBe(1_000_000)
  })

  it('should handle zero', () => {
    expect(centsToMicros(0)).toBe(0)
  })
})

describe('microsToDollars', () => {
  it('should convert micro-dollars to dollars', () => {
    expect(microsToDollars(1_000_000)).toBe(1)
    expect(microsToDollars(500_000)).toBe(0.5)
    expect(microsToDollars(1_000)).toBe(0.001)
  })
})

describe('formatMicrosAsDollars', () => {
  it('should format large amounts with 2 decimals', () => {
    expect(formatMicrosAsDollars(1_000_000)).toBe('$1.00')
    expect(formatMicrosAsDollars(1_500_000)).toBe('$1.50')
  })

  it('should format small amounts with 4 decimals', () => {
    expect(formatMicrosAsDollars(1_000)).toBe('$0.0010')
    expect(formatMicrosAsDollars(100)).toBe('$0.0001')
  })
})

describe('calculateAIInputCost', () => {
  it('should calculate cost for known models', () => {
    // gpt-5-mini: 0.25 micro-dollars per token ($0.25 per 1M tokens)
    const cost = calculateAIInputCost('gpt-5-mini', 1000)
    expect(cost).toBe(250) // 1000 * 0.25
  })

  it('should throw for unknown models', () => {
    expect(() => calculateAIInputCost('unknown-model', 100)).toThrow('Unknown AI model')
  })

  it('should handle zero tokens', () => {
    expect(calculateAIInputCost('gpt-5-mini', 0)).toBe(0)
  })
})

describe('calculateAIOutputCost', () => {
  it('should calculate cost for known models', () => {
    // gpt-5-mini: 2.0 micro-dollars per output token ($2.00 per 1M tokens)
    const cost = calculateAIOutputCost('gpt-5-mini', 1000)
    expect(cost).toBe(2000) // 1000 * 2.0
  })

  it('should throw for unknown models', () => {
    expect(() => calculateAIOutputCost('unknown-model', 100)).toThrow('Unknown AI model')
  })
})

describe('calculateAICompletionCost', () => {
  it('should sum input and output costs', () => {
    const inputCost = calculateAIInputCost('gpt-5-mini', 1000)
    const outputCost = calculateAIOutputCost('gpt-5-mini', 500)
    const totalCost = calculateAICompletionCost('gpt-5-mini', 1000, 500)
    expect(totalCost).toBe(inputCost + outputCost)
  })
})

describe('createAIUsageRecords', () => {
  it('should create records for input and output tokens', () => {
    const records = createAIUsageRecords('gpt-5-mini', 1000, 500)
    expect(records).toHaveLength(2)

    const inputRecord = records.find((r) => r.resource === 'ai_input_token')
    const outputRecord = records.find((r) => r.resource === 'ai_output_token')

    expect(inputRecord).toBeDefined()
    expect(inputRecord?.quantity).toBe(1000)
    expect(inputRecord?.provider).toBe('openai')

    expect(outputRecord).toBeDefined()
    expect(outputRecord?.quantity).toBe(500)
  })

  it('should not create records for zero tokens', () => {
    const records = createAIUsageRecords('gpt-5-mini', 0, 500)
    expect(records).toHaveLength(1)
    expect(records[0]?.resource).toBe('ai_output_token')
  })

  it('should include metadata if provided', () => {
    const records = createAIUsageRecords('gpt-5-mini', 100, 50, { batchId: '123' })
    expect(records[0]?.metadata).toEqual({ batchId: '123' })
  })

  it('should throw for unknown models', () => {
    expect(() => createAIUsageRecords('unknown-model', 100, 50)).toThrow('Unknown AI model')
  })
})

describe('calculateEmbeddingCost', () => {
  it('should calculate cost for known models', () => {
    // text-embedding-3-small: 0.02 micro-dollars per token
    const cost = calculateEmbeddingCost('text-embedding-3-small', 10000)
    expect(cost).toBe(200) // 10000 * 0.02
  })

  it('should throw for unknown models', () => {
    expect(() => calculateEmbeddingCost('unknown-model', 100)).toThrow('Unknown embedding model')
  })
})

describe('createEmbeddingUsageRecord', () => {
  it('should create a record for embedding tokens', () => {
    const record = createEmbeddingUsageRecord('text-embedding-3-small', 5000)
    expect(record.resource).toBe('embedding_token')
    expect(record.quantity).toBe(5000)
    expect(record.provider).toBe('openai')
    expect(record.costMicros).toBe(100) // 5000 * 0.02
  })

  it('should throw for unknown models', () => {
    expect(() => createEmbeddingUsageRecord('unknown-model', 100)).toThrow(
      'Unknown embedding model'
    )
  })
})

describe('calculatePlacesLookupCost', () => {
  it('should calculate cost based on request count', () => {
    // $0.017 per request = 17,000 micro-dollars
    expect(calculatePlacesLookupCost(1)).toBe(17_000)
    expect(calculatePlacesLookupCost(10)).toBe(170_000)
  })

  it('should handle zero requests', () => {
    expect(calculatePlacesLookupCost(0)).toBe(0)
  })
})

describe('calculateGeocodingCost', () => {
  it('should calculate cost based on request count', () => {
    // $0.005 per request = 5,000 micro-dollars
    expect(calculateGeocodingCost(1)).toBe(5_000)
    expect(calculateGeocodingCost(10)).toBe(50_000)
  })
})

describe('createGeocodingUsageRecord', () => {
  it('should create record for places lookups', () => {
    const record = createGeocodingUsageRecord('places', 5)
    expect(record.resource).toBe('google_places_lookup')
    expect(record.quantity).toBe(5)
    expect(record.provider).toBe('google_places')
    expect(record.costMicros).toBe(85_000) // 5 * 17,000
  })

  it('should create record for geocoding lookups', () => {
    const record = createGeocodingUsageRecord('geocoding', 10)
    expect(record.resource).toBe('google_geocoding_lookup')
    expect(record.quantity).toBe(10)
    expect(record.provider).toBe('google_geocoding')
    expect(record.costMicros).toBe(50_000) // 10 * 5,000
  })
})

describe('calculatePlacesPhotoCost', () => {
  it('should calculate cost based on request count', () => {
    // $0.007 per photo = 7,000 micro-dollars
    expect(calculatePlacesPhotoCost(1)).toBe(7_000)
    expect(calculatePlacesPhotoCost(100)).toBe(700_000)
  })
})

describe('calculatePixabayCost', () => {
  it('should always return 0 (free service)', () => {
    expect(calculatePixabayCost(0)).toBe(0)
    expect(calculatePixabayCost(100)).toBe(0)
    expect(calculatePixabayCost(1000)).toBe(0)
  })
})

describe('calculatePexelsCost', () => {
  it('should always return 0 (free service)', () => {
    expect(calculatePexelsCost(0)).toBe(0)
    expect(calculatePexelsCost(100)).toBe(0)
  })
})

describe('createImageUsageRecord', () => {
  it('should create record for Google Places photos', () => {
    const record = createImageUsageRecord('google_places', 10)
    expect(record.resource).toBe('google_places_photo')
    expect(record.quantity).toBe(10)
    expect(record.costMicros).toBe(70_000) // 10 * 7,000
  })

  it('should create record for Pixabay (free)', () => {
    const record = createImageUsageRecord('pixabay', 50)
    expect(record.resource).toBe('pixabay_search')
    expect(record.quantity).toBe(50)
    expect(record.costMicros).toBe(0)
  })

  it('should create record for Pexels (free)', () => {
    const record = createImageUsageRecord('pexels', 25)
    expect(record.resource).toBe('pexels_search')
    expect(record.quantity).toBe(25)
    expect(record.costMicros).toBe(0)
  })
})

describe('sumUsageCosts', () => {
  it('should sum costs from multiple records', () => {
    const records: UsageRecord[] = [
      {
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 150,
        timestamp: new Date()
      },
      {
        resource: 'ai_output_token',
        provider: 'openai',
        quantity: 500,
        costMicros: 300,
        timestamp: new Date()
      },
      {
        resource: 'google_places_lookup',
        provider: 'google_places',
        quantity: 5,
        costMicros: 85_000,
        timestamp: new Date()
      }
    ]
    expect(sumUsageCosts(records)).toBe(85_450)
  })

  it('should return 0 for empty array', () => {
    expect(sumUsageCosts([])).toBe(0)
  })
})

describe('groupByResource', () => {
  it('should group records by resource type', () => {
    const records: UsageRecord[] = [
      {
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 100,
        timestamp: new Date()
      },
      {
        resource: 'ai_input_token',
        provider: 'anthropic',
        quantity: 500,
        costMicros: 50,
        timestamp: new Date()
      },
      {
        resource: 'google_places_lookup',
        provider: 'google_places',
        quantity: 5,
        costMicros: 85_000,
        timestamp: new Date()
      }
    ]

    const grouped = groupByResource(records)

    expect(grouped.ai_input_token).toEqual({ quantity: 1500, costMicros: 150 })
    expect(grouped.google_places_lookup).toEqual({ quantity: 5, costMicros: 85_000 })
  })
})

describe('groupByProvider', () => {
  it('should group records by provider', () => {
    const records: UsageRecord[] = [
      {
        resource: 'ai_input_token',
        provider: 'openai',
        quantity: 1000,
        costMicros: 100,
        timestamp: new Date()
      },
      {
        resource: 'embedding_token',
        provider: 'openai',
        quantity: 5000,
        costMicros: 50,
        timestamp: new Date()
      },
      {
        resource: 'google_places_lookup',
        provider: 'google_places',
        quantity: 5,
        costMicros: 85_000,
        timestamp: new Date()
      }
    ]

    const grouped = groupByProvider(records)

    expect(grouped.openai).toEqual({ quantity: 6000, costMicros: 150 })
    expect(grouped.google_places).toEqual({ quantity: 5, costMicros: 85_000 })
  })
})
