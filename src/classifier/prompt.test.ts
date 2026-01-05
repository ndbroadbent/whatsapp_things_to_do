import { describe, expect, it } from 'vitest'
import type { ScrapedMetadata } from '../scraper/types'
import type { CandidateMessage, ContextMessage, QueryType } from '../types'
import {
  buildClassificationPrompt,
  type ClassificationContext,
  injectUrlMetadataIntoText,
  parseClassificationResponse,
  separateCandidatesByType
} from './prompt'

const TEST_CONTEXT: ClassificationContext = {
  homeCountry: 'New Zealand',
  timezone: 'Pacific/Auckland'
}

function createContextMessage(id: number, content: string, sender = 'User'): ContextMessage {
  return {
    id,
    sender,
    content,
    timestamp: new Date('2025-01-15T10:30:00Z')
  }
}

function createCandidate(
  id: number,
  content: string,
  contextBefore: ContextMessage[] = [],
  contextAfter: ContextMessage[] = [],
  candidateType: QueryType = 'suggestion'
): CandidateMessage {
  return {
    messageId: id,
    content,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    candidateType,
    contextBefore,
    contextAfter
  }
}

describe('Classifier Prompt', () => {
  describe('buildClassificationPrompt', () => {
    it('builds prompt for single candidate', () => {
      const candidates = [createCandidate(1, 'We should go to that restaurant')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      expect(prompt).toContain('We should go to that restaurant')
      expect(prompt).toContain('msg')
      expect(prompt).toContain('JSON')
    })

    it('builds prompt for multiple candidates', () => {
      const candidates = [
        createCandidate(1, 'We should go hiking'),
        createCandidate(2, "Let's try that cafe"),
        createCandidate(3, 'Check out this concert')
      ]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      expect(prompt).toContain('We should go hiking')
      expect(prompt).toContain("Let's try that cafe")
      expect(prompt).toContain('Check out this concert')
    })

    it('includes context when provided', () => {
      const candidates = [
        createCandidate(1, 'We should go there', [
          createContextMessage(0, 'I found a great place', 'Previous')
        ])
      ]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      expect(prompt).toContain('I found a great place')
    })

    it('includes message ID in prompt', () => {
      const candidates = [createCandidate(42, 'We should visit')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      expect(prompt).toContain('42')
    })

    it('requests structured JSON output with activity fields', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      // Core output fields
      expect(prompt).toContain('"msg"')
      expect(prompt).toContain('"title"')
      expect(prompt).toContain('"fun"')
      expect(prompt).toContain('"int"')
      expect(prompt).toContain('"cat"')
      // Location fields
      expect(prompt).toContain('"wikiName"')
      expect(prompt).toContain('"placeName"')
      expect(prompt).toContain('"placeQuery"')
      expect(prompt).toContain('"city"')
      expect(prompt).toContain('"country"')
      // Image hints
      expect(prompt).toContain('"image"')
      expect(prompt).toContain('"stock"')
      expect(prompt).toContain('"mediaKey"')
      expect(prompt).toContain('"preferStock"')
    })

    it('lists valid categories', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      // Check for some category names from VALID_CATEGORIES
      expect(prompt).toContain('food')
      expect(prompt).toContain('nature')
      expect(prompt).toContain('entertainment')
      expect(prompt).toContain('travel')
      expect(prompt).toContain('music')
    })

    it('includes image mediaKey specificity rules', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      // With new schema, normalization rules for action/object are gone
      // But we still have specificity rules for image.mediaKey
      expect(prompt).toContain('KEEP mediaKey specificity')
    })

    it('includes adult content filter instructions', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      // Must filter romantic/intimate content
      expect(prompt).toContain('Romantic/intimate')
      expect(prompt).toContain('adult content')
    })

    it('tags agreement candidates with [AGREE]', () => {
      const candidates = [createCandidate(1, 'Sounds great!', [], [], 'agreement')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      expect(prompt).toContain('ID: 1 [AGREE]')
    })

    it('does not tag suggestion candidates', () => {
      const candidates = [createCandidate(1, 'We should try that restaurant', [], [], 'suggestion')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      // Check that the ID line doesn't have [AGREE] tag
      expect(prompt).toContain('ID: 1 |')
      expect(prompt).not.toContain('ID: 1 [AGREE]')
    })

    it('uses suggestion prompt for mixed candidates (separation happens at classifier level)', () => {
      const candidates = [
        createCandidate(1, 'Lets go to that cafe', [], [], 'suggestion'),
        createCandidate(2, 'Sounds fun!', [], [], 'agreement'),
        createCandidate(3, 'Check out this hike', [], [], 'suggestion')
      ]

      // When mixed candidates are passed, auto-detection picks suggestion prompt
      // (since not ALL are agreements). Real separation happens in classifyMessages.
      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      // Should use suggestion prompt (no [AGREE] handling in prompt)
      expect(prompt).toContain('ID: 1 |')
      expect(prompt).toContain('ID: 2 |') // No [AGREE] tag in suggestion prompt
      expect(prompt).toContain('ID: 3 |')
      expect(prompt).not.toContain('[AGREE]')
    })
  })

  describe('separateCandidatesByType', () => {
    it('separates suggestions from agreements', () => {
      const candidates = [
        createCandidate(1, 'Lets go to that cafe', [], [], 'suggestion'),
        createCandidate(2, 'Sounds fun!', [], [], 'agreement'),
        createCandidate(3, 'Check out this hike', [], [], 'suggestion'),
        createCandidate(4, 'Amazing!', [], [], 'agreement')
      ]

      const { suggestions, agreements } = separateCandidatesByType(candidates)

      expect(suggestions).toHaveLength(2)
      expect(agreements).toHaveLength(2)
      expect(suggestions.map((c) => c.messageId)).toEqual([1, 3])
      expect(agreements.map((c) => c.messageId)).toEqual([2, 4])
    })

    it('handles all suggestions', () => {
      const candidates = [
        createCandidate(1, 'Lets go hiking', [], [], 'suggestion'),
        createCandidate(2, 'Try that restaurant', [], [], 'suggestion')
      ]

      const { suggestions, agreements } = separateCandidatesByType(candidates)

      expect(suggestions).toHaveLength(2)
      expect(agreements).toHaveLength(0)
    })

    it('handles all agreements', () => {
      const candidates = [
        createCandidate(1, 'Sounds great!', [], [], 'agreement'),
        createCandidate(2, 'Im keen!', [], [], 'agreement')
      ]

      const { suggestions, agreements } = separateCandidatesByType(candidates)

      expect(suggestions).toHaveLength(0)
      expect(agreements).toHaveLength(2)
    })

    it('handles empty array', () => {
      const { suggestions, agreements } = separateCandidatesByType([])

      expect(suggestions).toHaveLength(0)
      expect(agreements).toHaveLength(0)
    })
  })

  describe('parseClassificationResponse', () => {
    it('parses valid JSON array response with new schema', () => {
      const response = `[
        {
          "msg": 1,
          "title": "Dinner at Italian place",
          "fun": 4.5,
          "int": 3.5,
          "cat": "restaurant",
          "wikiName": null,
          "placeName": null,
          "placeQuery": "Italian place Rome",
          "city": "Rome",
          "region": null,
          "country": "Italy",
          "image": {
            "stock": "italian restaurant pasta rome",
            "mediaKey": "restaurant",
            "preferStock": true
          }
        }
      ]`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.msg).toBe(1)
      expect(parsed[0]?.title).toBe('Dinner at Italian place')
      expect(parsed[0]?.fun).toBe(4.5)
      expect(parsed[0]?.int).toBe(3.5)
      expect(parsed[0]?.cat).toBe('restaurant')
      expect(parsed[0]?.placeQuery).toBe('Italian place Rome')
      expect(parsed[0]?.city).toBe('Rome')
      expect(parsed[0]?.country).toBe('Italy')
      expect(parsed[0]?.image.stock).toBe('italian restaurant pasta rome')
      expect(parsed[0]?.image.mediaKey).toBe('restaurant')
      expect(parsed[0]?.image.preferStock).toBe(true)
    })

    it('parses multiple items', () => {
      const response = `[
        {"msg": 1, "title": "Hiking", "fun": 4.0, "int": 3.0, "cat": "hike", "city": "Mountains", "image": {"stock": "hiking trail mountains", "mediaKey": "hiking", "preferStock": true}},
        {"msg": 2, "title": "Vet visit", "fun": 0.5, "int": 1.0, "cat": "other", "image": {"stock": "veterinarian clinic", "mediaKey": null, "preferStock": false}}
      ]`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(2)
      expect(parsed[0]?.cat).toBe('hike')
    })

    it('handles response with markdown code block', () => {
      const response = `\`\`\`json
[{"msg": 1, "title": "Beach day", "fun": 4.5, "int": 2.5, "cat": "nature", "city": "Malibu", "region": "California", "country": "USA", "image": {"stock": "beach ocean waves", "mediaKey": "beach", "preferStock": false}}]
\`\`\``

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.cat).toBe('nature')
    })

    it('handles response with extra text around JSON', () => {
      const response = `Here is the classification:

[{"msg": 1, "title": "Concert", "fun": 4.25, "int": 2.5, "cat": "concert", "placeQuery": "Madison Square Garden New York", "city": "New York", "region": "NY", "country": "USA", "image": {"stock": "concert venue live music", "mediaKey": "concert", "preferStock": true}}]

Hope this helps!`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.title).toBe('Concert')
    })

    it('handles null location fields', () => {
      const response = `[{"msg": 1, "title": "Something fun", "fun": 3.5, "int": 2.5, "cat": "other", "wikiName": null, "placeName": null, "placeQuery": null, "city": null, "region": null, "country": null, "image": {"stock": "fun activity", "mediaKey": null, "preferStock": false}}]`

      const parsed = parseClassificationResponse(response)

      expect(parsed[0]?.placeName).toBeNull()
      expect(parsed[0]?.placeQuery).toBeNull()
      expect(parsed[0]?.city).toBeNull()
      expect(parsed[0]?.country).toBeNull()
    })

    it('defaults missing preferStock to false', () => {
      const response = `[{"msg": 1, "title": "Test", "fun": 2.5, "int": 2.5, "cat": "other", "image": {"stock": "test"}}]`

      const parsed = parseClassificationResponse(response)

      expect(parsed[0]?.image.preferStock).toBe(false)
    })

    it('parses string-typed numbers (gpt-5-nano compatibility)', () => {
      // Some models return numbers as strings. Scores are 0-5 scale.
      const response = `[{"msg": "168", "title": "Test", "fun": "4.25", "int": "3.5", "cat": "other", "image": {"stock": "test"}}]`

      const parsed = parseClassificationResponse(response)

      expect(parsed[0]?.msg).toBe(168)
      expect(parsed[0]?.fun).toBe(4.3) // 4.25 rounds to 4.3
      expect(parsed[0]?.int).toBe(3.5)
    })

    it('parses string-typed booleans for preferStock', () => {
      // Some models return booleans as strings. Scores are 0-5 scale.
      const response = `[{"msg": 1, "title": "Test", "fun": 3.5, "int": 2.5, "cat": "other", "image": {"stock": "test", "preferStock": "true"}}]`

      const parsed = parseClassificationResponse(response)

      expect(parsed[0]?.image.preferStock).toBe(true)
    })

    it('throws on invalid JSON', () => {
      const response = 'not valid json at all'

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('throws on non-array JSON', () => {
      const response = '{"msg": 1}'

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('throws on empty string response', () => {
      const response = ''

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('returns empty array when no activities found', () => {
      const response = '[]'

      const parsed = parseClassificationResponse(response)

      expect(parsed).toEqual([])
    })

    it('validates message IDs when expected IDs provided', () => {
      const response = `[{"msg": 1, "title": "Test", "fun": 2.5, "int": 2.5, "cat": "other", "image": {"stock": "test"}}]`

      // Should not throw when ID matches
      expect(() => parseClassificationResponse(response, [1])).not.toThrow()

      // Should throw when no IDs match
      expect(() => parseClassificationResponse(response, [999])).toThrow(/no matching message IDs/)
    })
  })

  describe('injectUrlMetadataIntoText', () => {
    const metadata: ScrapedMetadata = {
      canonicalUrl: 'https://airbnb.com/rooms/123',
      contentId: '123',
      title: 'Cozy Cabin',
      description: 'A beautiful cabin in the woods',
      hashtags: [],
      creator: 'Host Name',
      imageUrl: null,
      categories: ['accommodation'],
      suggestedKeywords: []
    }

    it('injects metadata after URL', () => {
      const text = 'Check out https://airbnb.com/rooms/123 for our trip'
      const metadataMap = new Map([['https://airbnb.com/rooms/123', metadata]])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).toContain('https://airbnb.com/rooms/123')
      expect(result).toContain('[URL_META:')
      expect(result).toContain('"title":"Cozy Cabin"')
    })

    it('handles multiple URLs', () => {
      const text = 'See https://a.com and https://b.com'
      const metadataMap = new Map<string, ScrapedMetadata>([
        ['https://a.com', { ...metadata, canonicalUrl: 'https://a.com', title: 'Site A' }],
        ['https://b.com', { ...metadata, canonicalUrl: 'https://b.com', title: 'Site B' }]
      ])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).toContain('"title":"Site A"')
      expect(result).toContain('"title":"Site B"')
    })

    it('skips URLs without metadata', () => {
      const text = 'See https://unknown.com'
      const result = injectUrlMetadataIntoText(text, new Map())

      expect(result).toBe(text)
    })

    it('returns original text if no URLs', () => {
      const text = 'No links here'
      const result = injectUrlMetadataIntoText(text, new Map())

      expect(result).toBe(text)
    })

    it('truncates long descriptions', () => {
      const longDesc = 'A'.repeat(300)
      const metadataWithLongDesc = { ...metadata, description: longDesc }
      const text = 'Check https://airbnb.com/rooms/123'
      const metadataMap = new Map([['https://airbnb.com/rooms/123', metadataWithLongDesc]])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      // Description should be truncated to 200 chars
      expect(result).not.toContain('A'.repeat(300))
      expect(result).toContain('A'.repeat(200))
    })

    it('includes redirect_url when canonicalUrl differs from original URL', () => {
      const shortUrl = 'https://bit.ly/abc123'
      const finalUrl = 'https://example.com/some/long/path/to/content'
      const redirectedMetadata: ScrapedMetadata = {
        ...metadata,
        canonicalUrl: finalUrl
      }
      const text = `Check out ${shortUrl}`
      const metadataMap = new Map([[shortUrl, redirectedMetadata]])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).toContain(`"redirect_url":"${finalUrl}"`)
    })

    it('omits redirect_url when canonicalUrl matches original URL', () => {
      const url = 'https://airbnb.com/rooms/123'
      const text = `Check out ${url}`
      const metadataMap = new Map([[url, metadata]]) // canonicalUrl matches

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).not.toContain('redirect_url')
    })

    it('truncates redirect_url to 200 chars', () => {
      const shortUrl = 'https://bit.ly/abc'
      const longFinalUrl = `https://example.com/${'a'.repeat(250)}`
      const redirectedMetadata: ScrapedMetadata = {
        ...metadata,
        canonicalUrl: longFinalUrl
      }
      const text = `Check ${shortUrl}`
      const metadataMap = new Map([[shortUrl, redirectedMetadata]])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).toContain('redirect_url')
      expect(result).not.toContain(longFinalUrl)
      expect(result).toContain(longFinalUrl.slice(0, 200))
    })

    it('includes redirect_url even when scrape failed (no title/description)', () => {
      // When a shortened URL redirects but the destination fails to scrape,
      // we still want the classifier to see the final URL path (contains useful info)
      const shortUrl = 'https://tinyurl.com/a6vzxrj4'
      const finalUrl = 'https://fakesiteexample.com/blog/go-hiking-at-yellowstone-tips'
      const minimalMetadata: ScrapedMetadata = {
        canonicalUrl: finalUrl,
        contentId: null,
        title: null,
        description: null,
        hashtags: [],
        creator: null,
        imageUrl: null,
        categories: [],
        suggestedKeywords: []
      }
      const text = `Check out this blog post: ${shortUrl}`
      const metadataMap = new Map([[shortUrl, minimalMetadata]])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).toContain(`"redirect_url":"${finalUrl}"`)
    })

    it('omits null fields from JSON', () => {
      const minimalMetadata: ScrapedMetadata = {
        canonicalUrl: 'https://example.com',
        contentId: null,
        title: 'Test',
        description: null,
        hashtags: [],
        creator: null,
        imageUrl: null,
        categories: [],
        suggestedKeywords: []
      }
      const text = 'Check https://example.com'
      const metadataMap = new Map([['https://example.com', minimalMetadata]])

      const result = injectUrlMetadataIntoText(text, metadataMap)

      expect(result).toContain('"title":"Test"')
      expect(result).not.toContain('"description"')
      expect(result).not.toContain('"creator"')
      // platform is no longer included in the JSON output
      expect(result).not.toContain('"platform"')
    })
  })

  describe('buildClassificationPrompt with URL metadata', () => {
    const metadata: ScrapedMetadata = {
      canonicalUrl: 'https://youtube.com/watch?v=abc',
      contentId: 'abc',
      title: 'Cool Video',
      description: 'A cool video about stuff',
      hashtags: [],
      creator: 'Creator',
      imageUrl: 'https://img.youtube.com/abc.jpg',
      categories: ['video'],
      suggestedKeywords: []
    }

    it('enriches candidate contexts with URL metadata', () => {
      const candidates = [
        createCandidate(1, 'test', [
          createContextMessage(0, 'Watch https://youtube.com/watch?v=abc')
        ])
      ]
      const metadataMap = new Map([['https://youtube.com/watch?v=abc', metadata]])
      const contextWithMetadata: ClassificationContext = {
        ...TEST_CONTEXT,
        urlMetadata: metadataMap
      }

      const prompt = buildClassificationPrompt(candidates, contextWithMetadata)

      expect(prompt).toContain('[URL_META:')
      expect(prompt).toContain('"title":"Cool Video"')
    })

    it('handles candidates without matching URLs', () => {
      const candidates = [createCandidate(1, 'No URLs here')]
      const metadataMap = new Map([['https://other.com', metadata]])
      const contextWithMetadata: ClassificationContext = {
        ...TEST_CONTEXT,
        urlMetadata: metadataMap
      }

      const prompt = buildClassificationPrompt(candidates, contextWithMetadata)

      expect(prompt).toContain('No URLs here')
      // Should not have actual metadata injected (the prompt instructions mention [URL_META: {...}] as format)
      expect(prompt).not.toContain('"title":"Cool Video"')
    })

    it('works without URL metadata', () => {
      const candidates = [createCandidate(1, 'Watch https://youtube.com/watch?v=abc')]

      const prompt = buildClassificationPrompt(candidates, TEST_CONTEXT)

      expect(prompt).toContain('https://youtube.com/watch?v=abc')
      // Should not have actual metadata injected - checking for a specific title that would only appear from enrichment
      expect(prompt).not.toContain('"title":"Cool Video"')
    })
  })
})
