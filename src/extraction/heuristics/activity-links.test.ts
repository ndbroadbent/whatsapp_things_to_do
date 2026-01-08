import { describe, expect, it } from 'vitest'
import type { ParsedMessage } from '../../types'
import { extractActivityLinks } from './activity-links'

/**
 * Create a mock parsed message for testing.
 */
function createMessage(
  id: number,
  content: string,
  sender: string,
  urls?: string[]
): ParsedMessage {
  return {
    id,
    timestamp: new Date('2024-03-15T10:00:00Z'),
    sender,
    content,
    rawLine: content,
    hasMedia: false,
    urls,
    source: 'whatsapp'
  }
}

/**
 * Helper to get the first link from result, throwing if not present.
 * Used in tests where we've already asserted the link exists.
 */
function getFirstLink(result: ReturnType<typeof extractActivityLinks>) {
  const link = result.links[0]
  if (!link) throw new Error('Expected at least one link in result')
  return link
}

describe('extractActivityLinks', () => {
  describe('platform detection', () => {
    it('detects Instagram links', () => {
      const messages = [
        createMessage(0, 'Check this out', 'Alice', []),
        createMessage(1, 'This place looks amazing! https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ]),
        createMessage(2, 'We should go!', 'Alice', [])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.platform).toBe('instagram')
    })

    it('detects TikTok links', () => {
      const messages = [
        createMessage(0, 'Have you seen this? https://vm.tiktok.com/abc', 'Alice', [
          'https://vm.tiktok.com/abc'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.platform).toBe('tiktok')
    })

    it('detects YouTube links', () => {
      const messages = [
        createMessage(0, 'Watch this travel video https://youtu.be/xyz', 'Alice', [
          'https://youtu.be/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.platform).toBe('youtube')
    })

    it('detects X (Twitter) links', () => {
      const messages = [
        createMessage(0, 'This event looks cool https://x.com/user/status/123', 'Alice', [
          'https://x.com/user/status/123'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.platform).toBe('x')
    })

    it('detects Facebook links', () => {
      const messages = [
        createMessage(0, 'Check this page https://facebook.com/place/123', 'Alice', [
          'https://facebook.com/place/123'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.platform).toBe('facebook')
    })

    it('detects Google Maps links', () => {
      const messages = [
        createMessage(0, 'Here is the location https://maps.google.com/place/xyz', 'Alice', [
          'https://maps.google.com/place/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.platform).toBe('google_maps')
      expect(result.links[0]?.confidence).toBeGreaterThan(0.8) // Google Maps has high confidence
    })
  })

  describe('context extraction', () => {
    it('extracts 2 messages before and after the link', () => {
      const messages = [
        createMessage(0, 'First message', 'Alice', []),
        createMessage(1, 'Second message', 'Bob', []),
        createMessage(2, 'Look at this place! https://instagram.com/reel/xyz', 'Alice', [
          'https://instagram.com/reel/xyz'
        ]),
        createMessage(3, 'Wow amazing!', 'Bob', []),
        createMessage(4, 'We should go there!', 'Alice', [])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      const link = getFirstLink(result)

      expect(link.context.before).toHaveLength(2)
      expect(link.context.before[0]).toContain('First message')
      expect(link.context.before[1]).toContain('Second message')

      expect(link.context.after).toHaveLength(2)
      expect(link.context.after[0]).toContain('Wow amazing')
      expect(link.context.after[1]).toContain('should go')
    })

    it('handles messages at the start of chat', () => {
      const messages = [
        createMessage(0, 'https://instagram.com/reel/xyz', 'Alice', [
          'https://instagram.com/reel/xyz'
        ]),
        createMessage(1, 'Nice!', 'Bob', [])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.context.before).toHaveLength(0)
      expect(result.links[0]?.context.after).toHaveLength(1)
    })

    it('handles messages at the end of chat', () => {
      const messages = [
        createMessage(0, 'Look at this!', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      expect(result.links[0]?.context.before).toHaveLength(1)
      expect(result.links[0]?.context.after).toHaveLength(0)
    })

    it('preserves sender information in context', () => {
      const messages = [
        createMessage(0, 'Have you seen this?', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.context.sender).toBe('Bob')
      expect(result.links[0]?.context.messageContent).toContain('instagram.com')
    })
  })

  describe('intent scoring', () => {
    it('detects high-signal keywords', () => {
      const messages = [
        createMessage(0, 'We should try this place!', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ]),
        createMessage(2, "Let's go next time we visit!", 'Alice', [])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      const link = getFirstLink(result)
      const intent = link.intent

      expect(intent.keywords.length).toBeGreaterThan(0)
      expect(intent.keywords).toContain("let's go")
      expect(intent.keywords).toContain('next time')
      expect(intent.score).toBeGreaterThan(0.2)
    })

    it('detects high-signal emojis', () => {
      const messages = [
        createMessage(0, 'This restaurant looks incredible! \u{1F525}\u{1F60D}', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      const link = getFirstLink(result)
      const intent = link.intent

      expect(intent.emojis.length).toBeGreaterThan(0)
      expect(intent.emojis).toContain('\u{1F525}')
    })

    it('combines keywords and emojis for higher score', () => {
      const messages = [
        createMessage(
          0,
          "We should go here! \u{1F525}\u{1F60D} Let's try this place!",
          'Alice',
          []
        ),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      const link = getFirstLink(result)
      const intent = link.intent

      // Both keywords and emojis detected
      expect(intent.keywords.length).toBeGreaterThan(0)
      expect(intent.emojis.length).toBeGreaterThan(0)
      expect(intent.score).toBeGreaterThan(0.3)
    })

    it('gives low score for no intent signals', () => {
      const messages = [
        createMessage(0, 'ok', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ]),
        createMessage(2, 'thanks', 'Alice', [])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(1)
      const link = getFirstLink(result)
      const intent = link.intent

      expect(intent.keywords).toHaveLength(0)
      expect(intent.emojis).toHaveLength(0)
      expect(intent.score).toBe(0)
    })
  })

  describe('type inference', () => {
    it('infers place type from Google Maps', () => {
      const messages = [
        createMessage(0, 'https://maps.google.com/place/xyz', 'Alice', [
          'https://maps.google.com/place/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.inferredType).toBe('place')
    })

    it('infers place type from restaurant mentions', () => {
      const messages = [
        createMessage(0, 'This restaurant looks amazing!', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.inferredType).toBe('place')
    })

    it('infers event type from event mentions', () => {
      const messages = [
        createMessage(0, 'This concert looks awesome!', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.inferredType).toBe('event')
    })

    it('infers activity type from hiking mentions', () => {
      const messages = [
        createMessage(0, 'Want to do this hike?', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.inferredType).toBe('activity')
    })

    it('infers idea type from bucket list mentions', () => {
      const messages = [
        createMessage(0, 'Adding this to my bucket list!', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.inferredType).toBe('idea')
    })
  })

  describe('confidence calculation', () => {
    it('gives higher confidence to Google Maps links', () => {
      const messages = [
        createMessage(0, 'https://maps.google.com/place/xyz', 'Alice', [
          'https://maps.google.com/place/xyz'
        ]),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      const mapsLink = result.links.find((l) => l.platform === 'google_maps')
      const instaLink = result.links.find((l) => l.platform === 'instagram')

      expect(mapsLink).toBeDefined()
      expect(instaLink).toBeDefined()
      if (mapsLink && instaLink) {
        expect(mapsLink.confidence).toBeGreaterThan(instaLink.confidence)
      }
    })

    it('boosts confidence with intent signals', () => {
      // Low intent
      const messagesLow = [
        createMessage(0, 'ok', 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      // High intent
      const messagesHigh = [
        createMessage(0, "We should definitely go! \u{1F525} Let's try this!", 'Alice', []),
        createMessage(1, 'https://instagram.com/reel/abc', 'Bob', [
          'https://instagram.com/reel/abc'
        ])
      ]

      const resultLow = extractActivityLinks(messagesLow)
      const resultHigh = extractActivityLinks(messagesHigh)

      const lowLink = getFirstLink(resultLow)
      const highLink = getFirstLink(resultHigh)

      expect(highLink.confidence).toBeGreaterThan(lowLink.confidence)
    })
  })

  describe('filtering', () => {
    it('filters by minimum confidence', () => {
      const messages = [
        createMessage(0, 'https://instagram.com/reel/xyz', 'Alice', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      // With low threshold
      const resultLow = extractActivityLinks(messages, { minConfidence: 0.1 })
      expect(resultLow.links).toHaveLength(1)

      // With high threshold
      const resultHigh = extractActivityLinks(messages, { minConfidence: 0.9 })
      expect(resultHigh.links).toHaveLength(0)
    })

    it('excludes generic websites by default', () => {
      const messages = [
        createMessage(0, 'Check out this random site https://example.com/page', 'Alice', [
          'https://example.com/page'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(0)
      expect(result.totalUrls).toBe(1)
    })

    it('can include generic websites when specified', () => {
      const messages = [
        createMessage(0, 'We should go to this place! https://example.com/page', 'Alice', [
          'https://example.com/page'
        ])
      ]

      const result = extractActivityLinks(messages, {
        includeGenericWebsites: true
      })

      expect(result.links.length).toBeGreaterThan(0)
    })
  })

  describe('result structure', () => {
    it('returns correct counts', () => {
      const messages = [
        createMessage(0, 'https://instagram.com/reel/1', 'Alice', ['https://instagram.com/reel/1']),
        createMessage(1, 'https://instagram.com/reel/2', 'Bob', ['https://instagram.com/reel/2']),
        createMessage(2, 'https://example.com/page', 'Alice', ['https://example.com/page']) // generic
      ]

      const result = extractActivityLinks(messages)

      expect(result.totalUrls).toBe(3)
      expect(result.activityLinkCount).toBe(2) // Only social platform links
      expect(result.links).toHaveLength(2)
    })

    it('sorts links by confidence descending', () => {
      const messages = [
        createMessage(0, 'https://instagram.com/reel/xyz', 'Alice', [
          'https://instagram.com/reel/xyz'
        ]),
        createMessage(1, 'https://maps.google.com/place/abc', 'Bob', [
          'https://maps.google.com/place/abc'
        ])
      ]

      const result = extractActivityLinks(messages)

      // Google Maps should have higher confidence
      expect(result.links[0]?.platform).toBe('google_maps')

      const firstLink = result.links[0]
      const secondLink = result.links[1]
      if (firstLink && secondLink) {
        expect(firstLink.confidence).toBeGreaterThanOrEqual(secondLink.confidence)
      }
    })

    it('preserves message ID in links', () => {
      const messages = [
        createMessage(0, 'First message', 'Alice', []),
        createMessage(42, 'https://instagram.com/reel/xyz', 'Bob', [
          'https://instagram.com/reel/xyz'
        ])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links[0]?.messageId).toBe(42)
    })
  })

  describe('edge cases', () => {
    it('handles empty messages array', () => {
      const result = extractActivityLinks([])

      expect(result.links).toHaveLength(0)
      expect(result.totalUrls).toBe(0)
      expect(result.activityLinkCount).toBe(0)
    })

    it('handles messages without URLs', () => {
      const messages = [
        createMessage(0, 'Hello', 'Alice', []),
        createMessage(1, 'How are you?', 'Bob', [])
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(0)
      expect(result.totalUrls).toBe(0)
    })

    it('handles multiple URLs in one message', () => {
      const messages = [
        createMessage(
          0,
          'Check these out! https://instagram.com/reel/1 and https://youtube.com/watch?v=abc',
          'Alice',
          ['https://instagram.com/reel/1', 'https://youtube.com/watch?v=abc']
        )
      ]

      const result = extractActivityLinks(messages)

      expect(result.links).toHaveLength(2)
      expect(result.totalUrls).toBe(2)
    })
  })
})
