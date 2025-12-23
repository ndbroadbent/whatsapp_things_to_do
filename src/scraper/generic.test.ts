/**
 * Generic Scraper Unit Tests
 */

import { describe, expect, it } from 'vitest'
import { scrapeGeneric } from './generic'
import type { FetchFn } from './types'

/**
 * Create a mock fetch that simulates redirect chains.
 * Maps URL -> response. Use status 301/302 with location header for redirects.
 */
function createMockFetch(
  responses: Map<
    string,
    {
      status: number
      headers?: Record<string, string>
      body?: string
    }
  >
): FetchFn {
  return (async (input: string | URL | { url: string }) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = responses.get(url)

    if (!response) {
      throw new Error(`No mock response for URL: ${url}`)
    }

    return {
      url,
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      headers: {
        get: (name: string) => response.headers?.[name.toLowerCase()] ?? null
      },
      text: async () => response.body ?? ''
    }
  }) as unknown as FetchFn
}

describe('scrapeGeneric', () => {
  describe('redirect handling', () => {
    it('returns finalUrl in error when redirect leads to 404', async () => {
      const originalUrl = 'https://bit.ly/abc123'
      const finalUrl = 'https://example.com/deleted-page'

      const mockFetch = createMockFetch(
        new Map([
          [originalUrl, { status: 301, headers: { location: finalUrl } }],
          [finalUrl, { status: 404 }]
        ])
      )

      const result = await scrapeGeneric(originalUrl, { fetch: mockFetch })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.url).toBe(originalUrl)
        expect(result.error.finalUrl).toBe(finalUrl)
        expect(result.error.type).toBe('not_found')
      }
    })

    it('returns finalUrl in error when redirect leads to 403', async () => {
      const originalUrl = 'https://t.co/xyz789'
      const finalUrl = 'https://blocked-site.com/content'

      const mockFetch = createMockFetch(
        new Map([
          [originalUrl, { status: 302, headers: { location: finalUrl } }],
          [finalUrl, { status: 403 }]
        ])
      )

      const result = await scrapeGeneric(originalUrl, { fetch: mockFetch })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.url).toBe(originalUrl)
        expect(result.error.finalUrl).toBe(finalUrl)
        expect(result.error.type).toBe('blocked')
      }
    })

    it('returns finalUrl in error when redirect destination is unreachable', async () => {
      const originalUrl = 'https://tinyurl.com/abc'
      const finalUrl = 'https://fakesiteexample.com/blog/hiking-tips'

      // Redirect to a URL that throws a network error
      const mockFetch = (async (input: string | URL | { url: string }) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        if (url === originalUrl) {
          return {
            url,
            ok: false,
            status: 301,
            headers: { get: (name: string) => (name === 'location' ? finalUrl : null) },
            text: async () => ''
          }
        }
        // Simulate network error for unreachable domain
        throw new Error('Unable to connect')
      }) as unknown as FetchFn

      const result = await scrapeGeneric(originalUrl, { fetch: mockFetch })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.url).toBe(originalUrl)
        expect(result.error.finalUrl).toBe(finalUrl)
        expect(result.error.type).toBe('network')
        expect(result.error.message).toContain('Unable to connect')
      }
    })

    it('uses finalUrl as canonicalUrl on success', async () => {
      const originalUrl = 'https://bit.ly/short'
      const finalUrl = 'https://example.com/full-path-with-slug'

      const mockFetch = createMockFetch(
        new Map([
          [originalUrl, { status: 301, headers: { location: finalUrl } }],
          [
            finalUrl,
            {
              status: 200,
              body: `
                <html>
                  <head>
                    <meta property="og:title" content="Test Page">
                    <meta property="og:description" content="A test description">
                  </head>
                </html>
              `
            }
          ]
        ])
      )

      const result = await scrapeGeneric(originalUrl, { fetch: mockFetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.canonicalUrl).toBe(finalUrl)
      }
    })

    it('omits finalUrl when no redirect occurred', async () => {
      const url = 'https://example.com/page'

      const mockFetch = createMockFetch(new Map([[url, { status: 404 }]]))

      const result = await scrapeGeneric(url, { fetch: mockFetch })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.url).toBe(url)
        expect(result.error.finalUrl).toBeUndefined()
      }
    })

    it('handles multiple redirects in chain', async () => {
      const url1 = 'https://short.url/a'
      const url2 = 'https://medium.url/b'
      const url3 = 'https://final.url/content'

      const mockFetch = createMockFetch(
        new Map([
          [url1, { status: 301, headers: { location: url2 } }],
          [url2, { status: 302, headers: { location: url3 } }],
          [
            url3,
            {
              status: 200,
              body: '<html><head><meta property="og:title" content="Final"></head></html>'
            }
          ]
        ])
      )

      const result = await scrapeGeneric(url1, { fetch: mockFetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.canonicalUrl).toBe(url3)
        expect(result.metadata.title).toBe('Final')
      }
    })
  })
})
