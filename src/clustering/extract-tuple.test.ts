/**
 * Tests for tuple extraction
 */

import { describe, expect, it } from 'vitest'
import { extractTuple, formatTuple, isEmptyTuple, lemmatize, STOP_WORDS } from './extract-tuple.js'

describe('lemmatize', () => {
  it('should convert gerunds to base form', () => {
    expect(lemmatize('biking')).toBe('bike')
    expect(lemmatize('hiking')).toBe('hike')
    expect(lemmatize('swimming')).toBe('swim')
    expect(lemmatize('running')).toBe('run')
  })

  it('should convert plurals to singular', () => {
    expect(lemmatize('bikes')).toBe('bike')
    expect(lemmatize('restaurants')).toBe('restaurant')
    expect(lemmatize('movies')).toBe('movie')
  })

  it('should handle past tense', () => {
    expect(lemmatize('rode')).toBe('ride')
    expect(lemmatize('hiked')).toBe('hike')
  })

  it('should handle base forms unchanged', () => {
    expect(lemmatize('bike')).toBe('bike')
    expect(lemmatize('hike')).toBe('hike')
    expect(lemmatize('swim')).toBe('swim')
  })
})

describe('STOP_WORDS', () => {
  it('should include common English stop words', () => {
    expect(STOP_WORDS.has('the')).toBe(true)
    expect(STOP_WORDS.has('a')).toBe(true)
    expect(STOP_WORDS.has('to')).toBe(true)
    expect(STOP_WORDS.has('for')).toBe(true)
  })

  it('should include activity stop words', () => {
    expect(STOP_WORDS.has('go')).toBe(true)
    expect(STOP_WORDS.has('do')).toBe(true)
    expect(STOP_WORDS.has('take')).toBe(true)
    expect(STOP_WORDS.has('try')).toBe(true)
  })

  it('should include time words', () => {
    expect(STOP_WORDS.has('today')).toBe(true)
    expect(STOP_WORDS.has('tomorrow')).toBe(true)
    expect(STOP_WORDS.has('tonight')).toBe(true)
  })
})

describe('extractTuple', () => {
  describe('bike examples', () => {
    it('should extract tuple from "Go for a bike ride"', async () => {
      const tuple = await extractTuple('Go for a bike ride')
      expect(tuple.nouns).toContain('bike')
      expect(tuple.nouns).toContain('ride')
      // "bike ride" is a compound noun, no explicit verb (verb=null=wildcard)
      expect(tuple.verbs).toBeNull()
      expect(tuple.location).toBeNull()
    })

    it('should extract tuple from "Ride a bike"', async () => {
      const tuple = await extractTuple('Ride a bike')
      expect(tuple.nouns).toContain('bike')
      expect(tuple.verbs).toContain('ride')
      expect(tuple.location).toBeNull()
    })

    it('should extract tuple from "Go biking"', async () => {
      const tuple = await extractTuple('Go biking')
      expect(tuple.nouns).toContain('bike')
      expect(tuple.location).toBeNull()
    })

    it('should extract tuple from "Fix a bike"', async () => {
      const tuple = await extractTuple('Fix a bike')
      expect(tuple.nouns).toContain('bike')
      expect(tuple.verbs).toContain('fix')
      expect(tuple.location).toBeNull()
    })
  })

  describe('hike examples', () => {
    it('should extract tuple from "Go hiking"', async () => {
      const tuple = await extractTuple('Go hiking')
      expect(tuple.nouns).toContain('hike')
      expect(tuple.location).toBeNull()
    })

    it('should extract tuple from "Go for a hike"', async () => {
      const tuple = await extractTuple('Go for a hike')
      expect(tuple.nouns).toContain('hike')
      expect(tuple.location).toBeNull()
    })

    it('should extract tuple from "Hike in Queenstown" with location hint', async () => {
      const tuple = await extractTuple('Hike in Queenstown', 'Queenstown')
      expect(tuple.nouns).toContain('hike')
      expect(tuple.location).toBe('queenstown')
    })
  })

  describe('location handling', () => {
    it('should use location hint when provided', async () => {
      const tuple = await extractTuple('Go kayaking in Mexico', 'Mexico')
      expect(tuple.location).toBe('mexico')
    })

    it('should normalize location to lowercase', async () => {
      const tuple = await extractTuple('Visit Paris', 'Paris')
      expect(tuple.location).toBe('paris')
    })

    it('should remove parenthetical content from location', async () => {
      const tuple = await extractTuple('Visit Auckland', 'Auckland (New Zealand)')
      expect(tuple.location).toBe('auckland')
    })

    it('should treat "unspecified" as null', async () => {
      const tuple = await extractTuple('Go swimming', 'unspecified')
      expect(tuple.location).toBeNull()
    })

    it('should treat empty string as null', async () => {
      const tuple = await extractTuple('Go swimming', '')
      expect(tuple.location).toBeNull()
    })
  })

  describe('restaurant examples', () => {
    it('should extract tuple from "Try that new restaurant"', async () => {
      const tuple = await extractTuple('Try that new restaurant')
      expect(tuple.nouns).toContain('restaurant')
      expect(tuple.location).toBeNull()
    })

    it('should extract tuple from "Check out that restaurant"', async () => {
      const tuple = await extractTuple('Check out that restaurant')
      expect(tuple.nouns).toContain('restaurant')
      expect(tuple.location).toBeNull()
    })
  })

  describe('edge cases', () => {
    it('should return empty arrays for stop-word-only input', async () => {
      const tuple = await extractTuple('Go to the')
      expect(tuple.nouns).toBeNull()
      expect(tuple.verbs).toBeNull()
      expect(tuple.location).toBeNull()
    })

    it('should deduplicate words', async () => {
      const tuple = await extractTuple('bike bike bike')
      expect(tuple.nouns?.filter((n) => n === 'bike').length).toBe(1)
    })

    it('should sort words alphabetically', async () => {
      const tuple = await extractTuple('swim bike run')
      // Words should be sorted
      if (tuple.nouns && tuple.nouns.length > 1) {
        const nouns = tuple.nouns
        const sorted = [...nouns].sort()
        expect(nouns).toEqual(sorted)
      }
    })
  })
})

describe('isEmptyTuple', () => {
  it('should return true for completely empty tuple', () => {
    expect(isEmptyTuple({ nouns: null, verbs: null, location: null })).toBe(true)
  })

  it('should return false if nouns exist', () => {
    expect(isEmptyTuple({ nouns: ['bike'], verbs: null, location: null })).toBe(false)
  })

  it('should return false if verbs exist', () => {
    expect(isEmptyTuple({ nouns: null, verbs: ['ride'], location: null })).toBe(false)
  })

  it('should return false if location exists', () => {
    expect(isEmptyTuple({ nouns: null, verbs: null, location: 'paris' })).toBe(false)
  })
})

describe('formatTuple', () => {
  it('should format a complete tuple', () => {
    const result = formatTuple({ nouns: ['bike'], verbs: ['ride'], location: 'paris' })
    expect(result).toBe('(N:[bike], V:[ride], L:paris)')
  })

  it('should format tuple with multiple items', () => {
    const result = formatTuple({ nouns: ['bike', 'ride'], verbs: ['ride'], location: null })
    expect(result).toBe('(N:[bike,ride], V:[ride], L:null)')
  })

  it('should format empty tuple', () => {
    const result = formatTuple({ nouns: null, verbs: null, location: null })
    expect(result).toBe('(N:null, V:null, L:null)')
  })
})
