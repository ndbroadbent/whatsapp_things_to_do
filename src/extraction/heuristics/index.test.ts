import { describe, expect, it } from 'vitest'
import type { ParsedMessage } from '../../types'
import { extractCandidatesByHeuristics } from './index'

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
  describe('extractCandidatesByHeuristics', () => {
    describe('regex pattern matching', () => {
      it('matches "we should" pattern', () => {
        const messages = [createMessage(0, 'We should go to that restaurant')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]?.source.type).toBe('regex')
        expect(result.regexMatches).toBe(1)
      })

      it('matches "lets go" pattern', () => {
        const messages = [createMessage(0, "Let's go hiking this weekend")]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches "want to go" pattern', () => {
        const messages = [createMessage(0, 'I want to go to that beach')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches "bucket list" pattern', () => {
        const messages = [createMessage(0, 'This is on my bucket list!')]

        const result = extractCandidatesByHeuristics(messages)

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

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates.length).toBeGreaterThanOrEqual(1)
        expect(result.urlMatches).toBeGreaterThanOrEqual(1)
      })

      it('matches Yelp URLs', () => {
        const messages = [
          createMessage(0, 'We should go here', 'User', ['https://yelp.com/biz/some-restaurant'])
        ]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches TripAdvisor URLs', () => {
        const messages = [
          createMessage(0, 'Want to visit', 'User', [
            'https://tripadvisor.com/Restaurant_Review-something'
          ])
        ]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches Airbnb URLs', () => {
        const messages = [
          createMessage(0, "Let's stay here", 'User', ['https://airbnb.com/rooms/12345'])
        ]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches Booking.com URLs', () => {
        const messages = [
          createMessage(0, 'Should book this', 'User', ['https://booking.com/hotel/us/hotel-name'])
        ]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })

      it('matches Eventbrite URLs', () => {
        const messages = [
          createMessage(0, "Let's go to this event", 'User', [
            'https://eventbrite.com/e/event-tickets-123'
          ])
        ]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(1)
      })
    })

    describe('exclusion patterns', () => {
      it('excludes messages with "vet" mentions', () => {
        const messages = [createMessage(0, 'We should take the dog to the vet')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('excludes messages with "dentist" mentions', () => {
        const messages = [createMessage(0, 'Need to go to the dentist')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('excludes messages with "doctor" mentions', () => {
        const messages = [createMessage(0, 'I have a doctor appointment')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(0)
      })

      it('excludes messages with "mechanic" mentions', () => {
        const messages = [createMessage(0, 'Car needs to go to the mechanic')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates).toHaveLength(0)
      })
    })

    describe('confidence scoring', () => {
      it('boosts confidence for activity keywords', () => {
        const messages = [createMessage(0, 'We should go to that restaurant for dinner')]

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates[0]?.confidence).toBeGreaterThan(0.6)
      })

      it('applies minimum confidence threshold', () => {
        const messages = [
          createMessage(0, 'We should go somewhere'),
          createMessage(1, 'This restaurant looks amazing!')
        ]

        const result = extractCandidatesByHeuristics(messages, { minConfidence: 0.8 })

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

        const result = extractCandidatesByHeuristics(messages)

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

        const result = extractCandidatesByHeuristics(messages)
        const candidate = result.candidates[0]
        if (!candidate) throw new Error('candidate not found')

        expect(candidate.contextBefore.some((m) => m.content.includes('Previous'))).toBe(true)
        expect(candidate.contextAfter.some((m) => m.content.includes('Next'))).toBe(true)
      })
    })

    describe('edge cases', () => {
      it('handles empty messages array', () => {
        const result = extractCandidatesByHeuristics([])

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

        const result = extractCandidatesByHeuristics(messages)

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

        const result = extractCandidatesByHeuristics(messages)

        expect(result.candidates[0]?.sender).toBe('John Doe')
        expect(result.candidates[0]?.timestamp).toEqual(new Date('2025-01-15T10:30:00'))
      })
    })

    describe('options', () => {
      it('respects includeUrlBased=false option', () => {
        const messages = [
          createMessage(0, 'Check this', 'User', ['https://yelp.com/biz/restaurant'])
        ]

        const result = extractCandidatesByHeuristics(messages, { includeUrlBased: false })

        expect(result.urlMatches).toBe(0)
      })

      it('accepts additional patterns', () => {
        const messages = [createMessage(0, 'Custom pattern here')]

        const result = extractCandidatesByHeuristics(messages, {
          additionalPatterns: [/custom pattern/i]
        })

        expect(result.candidates).toHaveLength(1)
      })

      it('accepts additional exclusions', () => {
        const messages = [createMessage(0, 'We should go to the custom exclusion')]

        const result = extractCandidatesByHeuristics(messages, {
          additionalExclusions: [/custom exclusion/i]
        })

        expect(result.candidates).toHaveLength(0)
      })
    })

    describe('agreement deduplication', () => {
      it('removes agreement candidates near suggestions by default', () => {
        const messages = [
          createMessage(
            1,
            "Let's do a whale and dolphin safari! https://whalewatchingauckland.com",
            'Alice',
            ['https://whalewatchingauckland.com']
          ),
          createMessage(2, 'That looks amazing!', 'Bob')
        ]

        const result = extractCandidatesByHeuristics(messages)

        // Should only return the suggestion, not the agreement response
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]?.candidateType).toBe('suggestion')
        expect(result.candidates[0]?.content).toContain('whale and dolphin safari')
      })

      it('removes "would be awesome" agreement near suggestion with URL', () => {
        const messages = [
          createMessage(
            1,
            'Morning! I just saw this blog post, we should totally do this: https://tinyurl.com/a6vzxrj4',
            'John',
            ['https://tinyurl.com/a6vzxrj4']
          ),
          createMessage(2, 'Yeah that would be awesome!', 'Alice')
        ]

        const result = extractCandidatesByHeuristics(messages)

        // Should only return John's suggestion, not Alice's agreement
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]?.sender).toBe('John')
        expect(result.candidates[0]?.candidateType).toBe('suggestion')
      })

      it('keeps standalone agreements not near suggestions', () => {
        // Need many filler messages to exceed 280 chars context window
        const messages = [
          createMessage(1, "Let's try that new restaurant", 'Alice'),
          createMessage(2, 'Filler message one with some content here'),
          createMessage(3, 'Filler message two with some content here'),
          createMessage(4, 'Filler message three with some content here'),
          createMessage(5, 'Filler message four with some content here'),
          createMessage(6, 'Filler message five with some content here'),
          createMessage(7, 'Filler message six with some content here'),
          createMessage(8, 'Filler message seven with some content here'),
          createMessage(9, 'Filler message eight with some content here'),
          createMessage(10, 'Filler message nine with some content here'),
          createMessage(11, 'That looks amazing!', 'Bob') // Uses "looks amazing" pattern
        ]

        const result = extractCandidatesByHeuristics(messages)

        // Both should be kept since agreement is outside suggestion's context window
        expect(result.candidates).toHaveLength(2)
        expect(result.agreementsRemoved).toBe(0)
      })

      it('skips deduplication when skipAgreementDeduplication is true', () => {
        const messages = [
          createMessage(
            1,
            "Let's do a whale and dolphin safari! https://whalewatchingauckland.com",
            'Alice',
            ['https://whalewatchingauckland.com']
          ),
          createMessage(2, 'That looks amazing!', 'Bob')
        ]

        const result = extractCandidatesByHeuristics(messages, {
          skipAgreementDeduplication: true
        })

        // Both should be returned when deduplication is skipped
        expect(result.candidates).toHaveLength(2)
      })

      it('reports agreementsRemoved count', () => {
        const messages = [
          createMessage(1, "Let's do a whale safari!", 'Alice'),
          createMessage(2, 'That looks fun!', 'Bob'), // Uses "looks fun" pattern
          createMessage(3, 'That looks great!', 'Charlie') // Uses "looks great" pattern
        ]

        const result = extractCandidatesByHeuristics(messages)

        // Should report how many agreements were removed
        expect(result.agreementsRemoved).toBeGreaterThanOrEqual(1)
      })
    })
  })
})
