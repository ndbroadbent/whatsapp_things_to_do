import { describe, expect, it } from 'vitest'
import type { ParsedMessage } from '../types.js'
import { extractCandidates } from './index.js'

function createMessage(
  id: number,
  content: string,
  sender = 'Test User',
  urls?: string[]
): ParsedMessage {
  return {
    id,
    timestamp: new Date('2025-01-15T10:30:00'),
    sender,
    content,
    rawLine: content,
    hasMedia: false,
    urls,
    source: 'whatsapp'
  }
}

describe('Candidate Extractor', () => {
  describe('extractCandidates', () => {
    describe('regex pattern matching', () => {
      it('matches "we should" pattern', () => {
        const messages = [createMessage(0, 'We should go to that restaurant')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]?.source.type).toBe('regex')
        expect(result.regexMatches).toBe(1)
      })

      it('matches "lets go" pattern', () => {
        const messages = [createMessage(0, "Let's go hiking this weekend")]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches "want to go" pattern', () => {
        const messages = [createMessage(0, 'I want to go to that beach')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches "bucket list" pattern', () => {
        const messages = [createMessage(0, 'This is on my bucket list!')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })
    })

    describe('URL-based matching', () => {
      it('matches Google Maps URLs', () => {
        const messages = [
          createMessage(0, 'Check this place', 'User', [
            'https://maps.google.com/maps?q=restaurant'
          ])
        ]

        const result = extractCandidates(messages)

        expect(result.candidates.length).toBeGreaterThanOrEqual(1)
        expect(result.urlMatches).toBeGreaterThanOrEqual(1)
      })

      it('matches Yelp URLs', () => {
        const messages = [
          createMessage(0, 'We should go here', 'User', ['https://yelp.com/biz/some-restaurant'])
        ]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches TripAdvisor URLs', () => {
        const messages = [
          createMessage(0, 'Want to visit', 'User', [
            'https://tripadvisor.com/Restaurant_Review-something'
          ])
        ]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches Airbnb URLs', () => {
        const messages = [
          createMessage(0, "Let's stay here", 'User', ['https://airbnb.com/rooms/12345'])
        ]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches Booking.com URLs', () => {
        const messages = [
          createMessage(0, 'Should book this', 'User', ['https://booking.com/hotel/us/hotel-name'])
        ]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches Eventbrite URLs', () => {
        const messages = [
          createMessage(0, "Let's go to this event", 'User', [
            'https://eventbrite.com/e/event-tickets-123'
          ])
        ]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(1)
      })
    })

    describe('exclusion patterns', () => {
      it('excludes messages with "vet" mentions', () => {
        const messages = [createMessage(0, 'We should take the dog to the vet')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('excludes messages with "dentist" mentions', () => {
        const messages = [createMessage(0, 'Need to go to the dentist')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('excludes messages with "doctor" mentions', () => {
        const messages = [createMessage(0, 'I have a doctor appointment')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('excludes messages with "mechanic" mentions', () => {
        const messages = [createMessage(0, 'Car needs to go to the mechanic')]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(0)
      })
    })

    describe('confidence scoring', () => {
      it('boosts confidence for activity keywords', () => {
        const messages = [createMessage(0, 'We should go to that restaurant for dinner')]

        const result = extractCandidates(messages)

        expect(result.candidates[0]?.confidence).toBeGreaterThan(0.6)
      })

      it('applies minimum confidence threshold', () => {
        const messages = [
          createMessage(0, 'We should go somewhere'),
          createMessage(1, 'This restaurant looks amazing!')
        ]

        const result = extractCandidates(messages, { minConfidence: 0.8 })

        // Only high-confidence matches should remain
        for (const candidate of result.candidates) {
          expect(candidate.confidence).toBeGreaterThanOrEqual(0.8)
        }
      })
    })

    describe('deduplication', () => {
      it('keeps highest confidence when message matches multiple patterns', () => {
        const messages = [
          createMessage(0, "Let's go to this restaurant", 'User', ['https://yelp.com/biz/place'])
        ]

        const result = extractCandidates(messages)

        expect(result.totalUnique).toBe(1)
      })
    })

    describe('context extraction', () => {
      it('includes surrounding message context', () => {
        const messages = [
          createMessage(0, 'Previous message'),
          createMessage(1, 'We should go to that place'),
          createMessage(2, 'Next message')
        ]

        const result = extractCandidates(messages)

        expect(result.candidates[0]?.context).toContain('Previous message')
        expect(result.candidates[0]?.context).toContain('Next message')
      })
    })

    describe('edge cases', () => {
      it('handles empty messages array', () => {
        const result = extractCandidates([])

        expect(result.candidates).toHaveLength(0)
        expect(result.regexMatches).toBe(0)
        expect(result.urlMatches).toBe(0)
        expect(result.totalUnique).toBe(0)
      })

      it('handles messages with no matches', () => {
        const messages = [
          createMessage(0, 'Hello'),
          createMessage(1, 'How are you?'),
          createMessage(2, 'Good thanks')
        ]

        const result = extractCandidates(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('preserves sender and timestamp from original message', () => {
        const messages = [
          {
            id: 0,
            timestamp: new Date('2025-01-15T10:30:00'),
            sender: 'John Doe',
            content: 'We should go hiking',
            rawLine: 'We should go hiking',
            hasMedia: false,
            source: 'whatsapp' as const
          }
        ]

        const result = extractCandidates(messages)

        expect(result.candidates[0]?.sender).toBe('John Doe')
        expect(result.candidates[0]?.timestamp).toEqual(new Date('2025-01-15T10:30:00'))
      })
    })

    describe('options', () => {
      it('respects includeUrlBased=false option', () => {
        const messages = [
          createMessage(0, 'Check this', 'User', ['https://yelp.com/biz/restaurant'])
        ]

        const result = extractCandidates(messages, { includeUrlBased: false })

        expect(result.urlMatches).toBe(0)
      })

      it('accepts additional patterns', () => {
        const messages = [createMessage(0, 'Custom pattern here')]

        const result = extractCandidates(messages, {
          additionalPatterns: [/custom pattern/i]
        })

        expect(result.candidates).toHaveLength(1)
      })

      it('accepts additional exclusions', () => {
        const messages = [createMessage(0, 'We should go to the custom exclusion')]

        const result = extractCandidates(messages, {
          additionalExclusions: [/custom exclusion/i]
        })

        expect(result.candidates).toHaveLength(0)
      })
    })
  })
})
