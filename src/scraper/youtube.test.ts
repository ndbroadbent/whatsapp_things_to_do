/**
 * YouTube Scraper Unit Tests
 */

import { describe, expect, it } from 'vitest'
import { buildYouTubeUrl, extractYouTubeVideoId, scrapeYouTube } from './youtube.js'

describe('extractYouTubeVideoId', () => {
  describe('standard watch URLs', () => {
    it('extracts video ID from standard watch URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=oQ-Vc_xQrZk')).toBe(
        'oQ-Vc_xQrZk'
      )
    })

    it('extracts video ID with additional params', () => {
      expect(
        extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLtest')
      ).toBe('dQw4w9WgXcQ')
    })

    it('extracts video ID when v param is not first', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?list=PLtest&v=dQw4w9WgXcQ')).toBe(
        'dQw4w9WgXcQ'
      )
    })

    it('handles http URLs', () => {
      expect(extractYouTubeVideoId('http://youtube.com/watch?v=oQ-Vc_xQrZk')).toBe('oQ-Vc_xQrZk')
    })
  })

  describe('short URLs', () => {
    it('extracts video ID from youtu.be short URL', () => {
      expect(extractYouTubeVideoId('https://youtu.be/oQ-Vc_xQrZk')).toBe('oQ-Vc_xQrZk')
    })

    it('handles short URL with timestamp', () => {
      expect(extractYouTubeVideoId('https://youtu.be/oQ-Vc_xQrZk?t=120')).toBe('oQ-Vc_xQrZk')
    })
  })

  describe('embed URLs', () => {
    it('extracts video ID from embed URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/oQ-Vc_xQrZk')).toBe('oQ-Vc_xQrZk')
    })

    it('handles embed URL with params', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/embed/oQ-Vc_xQrZk?autoplay=1')).toBe(
        'oQ-Vc_xQrZk'
      )
    })

    it('handles nocookie embed URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube-nocookie.com/embed/oQ-Vc_xQrZk')).toBe(
        'oQ-Vc_xQrZk'
      )
    })
  })

  describe('shorts URLs', () => {
    it('extracts video ID from shorts URL', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBe(
        'abcdefghijk'
      )
    })
  })

  describe('edge cases', () => {
    it('returns null for invalid URL', () => {
      expect(extractYouTubeVideoId('https://example.com/video')).toBe(null)
    })

    it('returns null for YouTube URL without video ID', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/')).toBe(null)
    })

    it('returns null for video ID that is too short', () => {
      expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=abc')).toBe(null)
    })

    it('handles underscores and hyphens in video ID', () => {
      expect(extractYouTubeVideoId('https://youtu.be/a_B-c_D-e_F')).toBe('a_B-c_D-e_F')
    })
  })
})

describe('buildYouTubeUrl', () => {
  it('builds canonical watch URL from video ID', () => {
    expect(buildYouTubeUrl('oQ-Vc_xQrZk')).toBe('https://www.youtube.com/watch?v=oQ-Vc_xQrZk')
  })
})

describe('scrapeYouTube', () => {
  describe('error handling', () => {
    it('returns error for invalid URL without video ID', async () => {
      const result = await scrapeYouTube('https://youtube.com/')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
        expect(result.error.message).toContain('video ID')
      }
    })

    it('returns error on network failure', async () => {
      const mockFetch = async () => {
        throw new Error('Network error')
      }
      const result = await scrapeYouTube('https://youtube.com/watch?v=oQ-Vc_xQrZk', {
        fetch: mockFetch as unknown as typeof fetch
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('network')
      }
    })

    it('returns not_found for 404 response', async () => {
      const mockFetch = async () =>
        new Response('', { status: 404 }) as unknown as globalThis.Response
      const result = await scrapeYouTube('https://youtube.com/watch?v=oQ-Vc_xQrZk', {
        fetch: mockFetch as unknown as typeof fetch
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('not_found')
      }
    })

    it('returns parse error when no video data found', async () => {
      const mockFetch = async () =>
        new Response('<html><body>No video data</body></html>', {
          status: 200
        }) as unknown as globalThis.Response
      const result = await scrapeYouTube('https://youtube.com/watch?v=oQ-Vc_xQrZk', {
        fetch: mockFetch as unknown as typeof fetch
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.type).toBe('parse')
      }
    })
  })

  describe('with mock data', () => {
    const mockPlayerResponse = {
      videoDetails: {
        videoId: 'oQ-Vc_xQrZk',
        title: 'Easy Pasta Recipe',
        shortDescription: 'A delicious pasta recipe #cooking #food #recipe',
        author: 'ChefChannel',
        channelId: 'UC123456789',
        keywords: ['pasta', 'cooking', 'easy recipe'],
        thumbnail: {
          thumbnails: [
            { url: 'https://i.ytimg.com/vi/oQ-Vc_xQrZk/default.jpg', width: 120, height: 90 },
            {
              url: 'https://i.ytimg.com/vi/oQ-Vc_xQrZk/maxresdefault.jpg',
              width: 1280,
              height: 720
            }
          ]
        }
      },
      microformat: {
        playerMicroformatRenderer: {
          category: 'Howto & Style'
        }
      }
    }

    const mockHtml = `
      <html>
        <body>
          <script>var ytInitialPlayerResponse = ${JSON.stringify(mockPlayerResponse)};</script>
        </body>
      </html>
    `

    it('extracts metadata from mock HTML', async () => {
      const mockFetch = async () =>
        new Response(mockHtml, { status: 200 }) as unknown as globalThis.Response
      const result = await scrapeYouTube('https://youtube.com/watch?v=oQ-Vc_xQrZk', {
        fetch: mockFetch as unknown as typeof fetch
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.platform).toBe('youtube')
        expect(result.metadata.contentId).toBe('oQ-Vc_xQrZk')
        expect(result.metadata.title).toBe('Easy Pasta Recipe')
        expect(result.metadata.description).toContain('pasta recipe')
        expect(result.metadata.creator).toBe('ChefChannel')
        expect(result.metadata.creatorId).toBe('UC123456789')
        expect(result.metadata.hashtags).toContain('cooking')
        expect(result.metadata.hashtags).toContain('food')
        expect(result.metadata.categories).toContain('Howto & Style')
        expect(result.metadata.suggestedKeywords).toContain('pasta')
        expect(result.metadata.thumbnailUrl).toContain('maxresdefault.jpg')
      }
    })

    it('handles short URLs by extracting video ID', async () => {
      const mockFetch = async () =>
        new Response(mockHtml, { status: 200 }) as unknown as globalThis.Response
      const result = await scrapeYouTube('https://youtu.be/oQ-Vc_xQrZk', {
        fetch: mockFetch as unknown as typeof fetch
      })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.canonicalUrl).toBe('https://www.youtube.com/watch?v=oQ-Vc_xQrZk')
      }
    })
  })
})
