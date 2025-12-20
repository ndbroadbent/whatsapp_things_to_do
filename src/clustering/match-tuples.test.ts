/**
 * Tests for tuple matching
 */

import { describe, expect, it } from 'vitest'
import type { SemanticTuple } from './extract-tuple.js'
import { arraysIntersect, tupleSimilarity, tuplesMatch } from './match-tuples.js'

describe('arraysIntersect', () => {
  it('should return true when arrays have common elements', () => {
    expect(arraysIntersect(['a', 'b'], ['b', 'c'])).toBe(true)
    expect(arraysIntersect(['bike'], ['bike', 'ride'])).toBe(true)
  })

  it('should return false when arrays have no common elements', () => {
    expect(arraysIntersect(['a', 'b'], ['c', 'd'])).toBe(false)
    expect(arraysIntersect(['ride'], ['fix'])).toBe(false)
  })

  it('should return true when first array is null (wildcard)', () => {
    expect(arraysIntersect(null, ['a', 'b'])).toBe(true)
  })

  it('should return true when second array is null (wildcard)', () => {
    expect(arraysIntersect(['a', 'b'], null)).toBe(true)
  })

  it('should return true when both arrays are null', () => {
    expect(arraysIntersect(null, null)).toBe(true)
  })
})

describe('tuplesMatch', () => {
  describe('bike examples', () => {
    it('should match "Go biking" with "Ride a bike" (null verb is wildcard)', () => {
      const a: SemanticTuple = { nouns: ['bike'], verbs: null, location: null }
      const b: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })

    it('should NOT match "Ride a bike" with "Fix a bike" (different verbs)', () => {
      const a: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
      const b: SemanticTuple = { nouns: ['bike'], verbs: ['fix'], location: null }
      expect(tuplesMatch(a, b)).toBe(false)
    })

    it('should match "Go for a bike ride" with "Ride a bike"', () => {
      const a: SemanticTuple = { nouns: ['bike', 'ride'], verbs: ['ride'], location: null }
      const b: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })
  })

  describe('location examples', () => {
    it('should NOT match when one has location and other does not', () => {
      const a: SemanticTuple = { nouns: ['kayak'], verbs: null, location: null }
      const b: SemanticTuple = { nouns: ['kayak'], verbs: null, location: 'mexico' }
      expect(tuplesMatch(a, b)).toBe(false)
    })

    it('should NOT match different locations', () => {
      const a: SemanticTuple = { nouns: ['hike'], verbs: ['hike'], location: 'queenstown' }
      const b: SemanticTuple = { nouns: ['hike'], verbs: ['hike'], location: 'auckland' }
      expect(tuplesMatch(a, b)).toBe(false)
    })

    it('should match same locations', () => {
      const a: SemanticTuple = { nouns: ['hike'], verbs: ['hike'], location: 'queenstown' }
      const b: SemanticTuple = { nouns: ['hike'], verbs: null, location: 'queenstown' }
      expect(tuplesMatch(a, b)).toBe(true)
    })

    it('should match both null locations', () => {
      const a: SemanticTuple = { nouns: ['swim'], verbs: ['swim'], location: null }
      const b: SemanticTuple = { nouns: ['swim'], verbs: null, location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })
  })

  describe('noun intersection', () => {
    it('should match when nouns intersect', () => {
      const a: SemanticTuple = { nouns: ['bike', 'ride'], verbs: null, location: null }
      const b: SemanticTuple = { nouns: ['bike'], verbs: null, location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })

    it('should NOT match when nouns do not intersect', () => {
      const a: SemanticTuple = { nouns: ['bike'], verbs: null, location: null }
      const b: SemanticTuple = { nouns: ['kayak'], verbs: null, location: null }
      expect(tuplesMatch(a, b)).toBe(false)
    })

    it('should match when one noun array is null (wildcard)', () => {
      const a: SemanticTuple = { nouns: null, verbs: ['swim'], location: null }
      const b: SemanticTuple = { nouns: ['pool'], verbs: ['swim'], location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })
  })

  describe('verb intersection', () => {
    it('should match when verbs intersect', () => {
      const a: SemanticTuple = { nouns: ['bike'], verbs: ['ride', 'cycle'], location: null }
      const b: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })

    it('should match when one verb array is null (wildcard)', () => {
      const a: SemanticTuple = { nouns: ['bike'], verbs: null, location: null }
      const b: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should match two empty tuples (both all null)', () => {
      const a: SemanticTuple = { nouns: null, verbs: null, location: null }
      const b: SemanticTuple = { nouns: null, verbs: null, location: null }
      expect(tuplesMatch(a, b)).toBe(true)
    })

    it('should match location-only tuples with same location', () => {
      const a: SemanticTuple = { nouns: null, verbs: null, location: 'paris' }
      const b: SemanticTuple = { nouns: null, verbs: null, location: 'paris' }
      expect(tuplesMatch(a, b)).toBe(true)
    })
  })
})

describe('tupleSimilarity', () => {
  it('should return 0 for different locations', () => {
    const a: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: 'paris' }
    const b: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: 'london' }
    expect(tupleSimilarity(a, b)).toBe(0)
  })

  it('should return 1 for identical tuples', () => {
    const a: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
    expect(tupleSimilarity(a, a)).toBe(1)
  })

  it('should return high score for similar tuples', () => {
    const a: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
    const b: SemanticTuple = { nouns: ['bike', 'ride'], verbs: ['ride'], location: null }
    const score = tupleSimilarity(a, b)
    expect(score).toBeGreaterThan(0.5)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('should return partial score for wildcard matches', () => {
    const a: SemanticTuple = { nouns: ['bike'], verbs: null, location: null }
    const b: SemanticTuple = { nouns: ['bike'], verbs: ['ride'], location: null }
    const score = tupleSimilarity(a, b)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('should handle both nulls as perfect match', () => {
    const a: SemanticTuple = { nouns: null, verbs: null, location: null }
    const b: SemanticTuple = { nouns: null, verbs: null, location: null }
    expect(tupleSimilarity(a, b)).toBe(1)
  })
})
