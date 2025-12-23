/**
 * Eventbrite Scraper Unit Tests
 */

import { describe, expect, it } from 'vitest'
import { extractEventbriteId, scrapeEventbrite } from './eventbrite'

describe('extractEventbriteId', () => {
  describe('ticket URLs', () => {
    it('extracts ID from ticket URL', () => {
      expect(
        extractEventbriteId(
          'https://www.eventbrite.com/e/auckland-food-festival-tickets-123456789012'
        )
      ).toBe('123456789012')
    })

    it('extracts ID from ticket URL with query params', () => {
      expect(
        extractEventbriteId(
          'https://www.eventbrite.com/e/music-concert-tickets-987654321098?aff=ebdsoporgprofile'
        )
      ).toBe('987654321098')
    })
  })

  describe('direct event URLs', () => {
    it('extracts ID from /e/ URL', () => {
      expect(extractEventbriteId('https://www.eventbrite.com/e/123456789012')).toBe('123456789012')
    })
  })

  describe('edge cases', () => {
    it('returns null for invalid URL', () => {
      expect(extractEventbriteId('https://example.com/event/123')).toBeNull()
    })

    it('returns null for Eventbrite URL without event ID', () => {
      expect(extractEventbriteId('https://www.eventbrite.com/')).toBeNull()
    })

    it('returns null for short IDs (less than 9 digits)', () => {
      expect(extractEventbriteId('https://www.eventbrite.com/e/event-12345678')).toBeNull()
    })
  })
})

describe('scrapeEventbrite', () => {
  const MOCK_EVENT_JSONLD = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: 'Auckland Food & Wine Festival 2024',
    description: 'Annual food festival featuring local chefs #food #wine #auckland',
    image: 'https://example.com/food-fest.jpg',
    startDate: '2024-03-15T18:00:00+13:00',
    organizer: {
      '@type': 'Organization',
      name: 'Auckland Events Ltd'
    },
    location: {
      '@type': 'Place',
      name: 'Viaduct Harbour',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Auckland',
        addressRegion: 'Auckland'
      }
    }
  }

  const MOCK_HTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta property="og:title" content="Auckland Food Festival" />
      <meta property="og:description" content="Annual food event" />
      <meta property="og:image" content="https://example.com/food-og.jpg" />
      <script type="application/ld+json">${JSON.stringify(MOCK_EVENT_JSONLD)}</script>
    </head>
    <body></body>
    </html>
  `

  describe('successful scraping', () => {
    it('extracts metadata from event page', async () => {
      const mockFetch = async () =>
        new Response(MOCK_HTML, { status: 200 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/auckland-food-festival-tickets-123456789012',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.contentId).toBe('123456789012')
        expect(result.metadata.title).toBe('Auckland Food & Wine Festival 2024')
        expect(result.metadata.description).toContain('food festival')
        expect(result.metadata.hashtags).toContain('food')
        expect(result.metadata.hashtags).toContain('wine')
        expect(result.metadata.hashtags).toContain('auckland')
        expect(result.metadata.creator).toBe('Auckland Events Ltd')
        expect(result.metadata.thumbnailUrl).toBe('https://example.com/food-fest.jpg')
        expect(result.metadata.categories).toContain('event')
        expect(result.metadata.categories).toContain('Viaduct Harbour')
        expect(result.metadata.categories).toContain('Auckland, Auckland')
        expect(result.metadata.categories).toContain('Mar 15')
      }
    })

    it('handles events without organizer', async () => {
      const noOrgJsonLd = {
        '@type': 'Event',
        name: 'Community Meetup',
        description: 'Local tech meetup'
      }
      const noOrgHtml = `
        <html>
        <head>
          <script type="application/ld+json">${JSON.stringify(noOrgJsonLd)}</script>
        </head>
        </html>
      `
      const mockFetch = async () =>
        new Response(noOrgHtml, { status: 200 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/meetup-tickets-111222333444',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.title).toBe('Community Meetup')
        expect(result.metadata.creator).toBeNull()
      }
    })

    it('handles array images', async () => {
      const arrayImageJsonLd = {
        '@type': 'Event',
        name: 'Concert',
        description: 'Live music',
        image: ['https://example.com/concert1.jpg', 'https://example.com/concert2.jpg']
      }
      const arrayImageHtml = `
        <html>
        <head>
          <script type="application/ld+json">${JSON.stringify(arrayImageJsonLd)}</script>
        </head>
        </html>
      `
      const mockFetch = async () =>
        new Response(arrayImageHtml, { status: 200 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/concert-tickets-555666777888',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.thumbnailUrl).toBe('https://example.com/concert1.jpg')
      }
    })

    it('falls back to Open Graph when JSON-LD missing', async () => {
      const ogOnlyHtml = `
        <html>
        <head>
          <meta property="og:title" content="Yoga Workshop" />
          <meta property="og:description" content="Morning yoga session" />
          <meta property="og:image" content="https://example.com/yoga.jpg" />
        </head>
        </html>
      `
      const mockFetch = async () =>
        new Response(ogOnlyHtml, { status: 200 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/yoga-tickets-999888777666',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.title).toBe('Yoga Workshop')
        expect(result.metadata.thumbnailUrl).toBe('https://example.com/yoga.jpg')
      }
    })
  })

  describe('error handling', () => {
    it('returns error for invalid URL without event ID', async () => {
      const result = await scrapeEventbrite('https://www.eventbrite.com/')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
        expect(result.error.message).toContain('event ID')
      }
    })

    it('returns not_found for 404 response', async () => {
      const mockFetch = async () =>
        new Response('', { status: 404 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/gone-tickets-123456789012',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('not_found')
      }
    })

    it('returns blocked for 403 response', async () => {
      const mockFetch = async () =>
        new Response('', { status: 403 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/test-tickets-123456789012',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('blocked')
      }
    })

    it('returns blocked for 429 response', async () => {
      const mockFetch = async () =>
        new Response('', { status: 429 }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/test-tickets-123456789012',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('blocked')
      }
    })

    it('returns network error on fetch failure', async () => {
      const mockFetch = async () => {
        throw new Error('DNS resolution failed')
      }
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/test-tickets-123456789012',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })

    it('returns parse error when no data found', async () => {
      const mockFetch = async () =>
        new Response('<html><body>Page not available</body></html>', {
          status: 200
        }) as unknown as globalThis.Response
      const result = await scrapeEventbrite(
        'https://www.eventbrite.com/e/test-tickets-123456789012',
        { fetch: mockFetch as unknown as typeof fetch }
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
      }
    })
  })
})
