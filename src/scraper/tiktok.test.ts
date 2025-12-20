/**
 * TikTok Scraper Tests
 */

import { describe, expect, it } from 'vitest'
import { extractTikTokVideoId, scrapeTikTok } from './tiktok.js'

// Sample TikTok JSON data (simplified from real response)
const SAMPLE_TIKTOK_DATA = {
  __DEFAULT_SCOPE__: {
    'webapp.video-detail': {
      itemInfo: {
        itemStruct: {
          desc: 'Shostakovich: Waltz No. 2 #classicalmusic #accordion',
          author: {
            uniqueId: 'sergey.sadovoy',
            nickname: 'Sergey Sadovoy'
          },
          video: {
            cover: 'https://example.com/thumb.jpg'
          },
          diversificationLabels: ['Singing & Instruments', 'Talents'],
          suggestedWords: ['Accordion', 'Classical music', 'Waltz'],
          textExtra: [{ hashtagName: 'classicalmusic' }, { hashtagName: 'accordion' }],
          contents: [{ desc: 'Shostakovich: Waltz No. 2' }]
        }
      }
    }
  }
}

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>TikTok</title></head>
<body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
${JSON.stringify(SAMPLE_TIKTOK_DATA)}
</script>
</body>
</html>
`

/**
 * Create a mock response object that satisfies fetch requirements.
 */
function mockResponse(options: {
  ok?: boolean
  status?: number
  text?: string
  headers?: Record<string, string>
}): Response {
  const { ok = true, status = 200, text = '', headers = {} } = options
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(headers),
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(JSON.parse(text || '{}')),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    clone: () => mockResponse(options),
    redirected: false,
    type: 'basic',
    url: ''
  } as Response
}

describe('extractTikTokVideoId', () => {
  it('extracts video ID from full URL', () => {
    const url = 'https://www.tiktok.com/@user/video/7455066896669461782'
    expect(extractTikTokVideoId(url)).toBe('7455066896669461782')
  })

  it('extracts video ID from URL with query params', () => {
    const url = 'https://www.tiktok.com/@/video/7455066896669461782?_r=1&share=true'
    expect(extractTikTokVideoId(url)).toBe('7455066896669461782')
  })

  it('extracts video ID from /v/ format', () => {
    const url = 'https://www.tiktok.com/v/7455066896669461782'
    expect(extractTikTokVideoId(url)).toBe('7455066896669461782')
  })

  it('returns null for short URLs without video ID', () => {
    const url = 'https://vt.tiktok.com/ZS6myoDYu/'
    expect(extractTikTokVideoId(url)).toBeNull()
  })

  it('returns null for non-video URLs', () => {
    const url = 'https://www.tiktok.com/@user'
    expect(extractTikTokVideoId(url)).toBeNull()
  })
})

describe('scrapeTikTok', () => {
  /**
   * Create a mock fetch function for tests.
   * Uses config.fetch instead of globalThis.fetch to avoid CI guard issues.
   */
  function createMockFetch(
    handler: (url: string, options?: RequestInit) => Promise<Response>
  ): typeof fetch {
    return handler as typeof fetch
  }

  it('scrapes metadata from TikTok page', async () => {
    const mockFetch = createMockFetch(async (_url, options) => {
      if (options?.method === 'HEAD') {
        return mockResponse({ status: 200 })
      }
      return mockResponse({ text: SAMPLE_HTML })
    })

    const result = await scrapeTikTok('https://www.tiktok.com/@user/video/123456789', {
      fetch: mockFetch
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.metadata.platform).toBe('tiktok')
      expect(result.metadata.title).toBe('Shostakovich: Waltz No. 2')
      expect(result.metadata.description).toContain('Shostakovich')
      expect(result.metadata.hashtags).toContain('classicalmusic')
      expect(result.metadata.hashtags).toContain('accordion')
      expect(result.metadata.creator).toBe('sergey.sadovoy')
      expect(result.metadata.categories).toContain('Singing & Instruments')
      expect(result.metadata.suggestedKeywords).toContain('Accordion')
    }
  })

  it('follows redirects from short URLs', async () => {
    const redirectUrl = 'https://www.tiktok.com/@user/video/7455066896669461782'

    const mockFetch = createMockFetch(async (url, options) => {
      if (url.includes('vt.tiktok.com') && options?.method === 'HEAD') {
        return mockResponse({ status: 302, headers: { Location: redirectUrl } })
      }
      if (url.includes('tiktok.com/@') && options?.method === 'HEAD') {
        return mockResponse({ status: 200 })
      }
      return mockResponse({ text: SAMPLE_HTML })
    })

    const result = await scrapeTikTok('https://vt.tiktok.com/ZS6myoDYu/', { fetch: mockFetch })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.metadata.canonicalUrl).toContain('tiktok.com/@user/video/')
      expect(result.metadata.contentId).toBe('7455066896669461782')
    }
  })

  it('handles 404 errors', async () => {
    const mockFetch = createMockFetch(async (_url, options) => {
      if (options?.method === 'HEAD') {
        return mockResponse({ status: 200 })
      }
      return mockResponse({ ok: false, status: 404 })
    })

    const result = await scrapeTikTok('https://www.tiktok.com/@user/video/999', {
      fetch: mockFetch
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('not_found')
    }
  })

  it('handles rate limiting (429)', async () => {
    const mockFetch = createMockFetch(async (_url, options) => {
      if (options?.method === 'HEAD') {
        return mockResponse({ status: 200 })
      }
      return mockResponse({ ok: false, status: 429 })
    })

    const result = await scrapeTikTok('https://www.tiktok.com/@user/video/123', {
      fetch: mockFetch
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('blocked')
    }
  })

  it('handles missing JSON data in page', async () => {
    const mockFetch = createMockFetch(async (_url, options) => {
      if (options?.method === 'HEAD') {
        return mockResponse({ status: 200 })
      }
      return mockResponse({ text: '<html><body>No data here</body></html>' })
    })

    const result = await scrapeTikTok('https://www.tiktok.com/@user/video/123', {
      fetch: mockFetch
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('parse')
    }
  })

  it('handles network errors', async () => {
    const mockFetch = createMockFetch(async () => {
      throw new Error('Network error')
    })

    const result = await scrapeTikTok('https://www.tiktok.com/@user/video/123', {
      fetch: mockFetch
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe('network')
    }
  })

  it('extracts hashtags from description text', async () => {
    const dataWithHashtagsInDesc = {
      __DEFAULT_SCOPE__: {
        'webapp.video-detail': {
          itemInfo: {
            itemStruct: {
              desc: 'Check this out! #travel #adventure #newzealand',
              author: { uniqueId: 'traveler' },
              diversificationLabels: [],
              suggestedWords: []
            }
          }
        }
      }
    }

    const mockFetch = createMockFetch(async (_url, options) => {
      if (options?.method === 'HEAD') {
        return mockResponse({ status: 200 })
      }
      const html = `
        <html>
        <script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
        ${JSON.stringify(dataWithHashtagsInDesc)}
        </script>
        </html>
      `
      return mockResponse({ text: html })
    })

    const result = await scrapeTikTok('https://www.tiktok.com/@user/video/123', {
      fetch: mockFetch
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.metadata.hashtags).toContain('travel')
      expect(result.metadata.hashtags).toContain('adventure')
      expect(result.metadata.hashtags).toContain('newzealand')
    }
  })
})
