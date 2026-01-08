/**
 * Spotify Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { scrapeSpotify } from './spotify'
import { HttpRecorder } from './test-support/http-recorder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'spotify')

describe('Spotify Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeSpotify', () => {
    it('scrapes Taylor Swift album with thumbnail', async () => {
      // The Tortured Poets Department
      const url = 'https://open.spotify.com/album/1Mo4aZ8pdj6L1jx8zSwJnt'
      const result = await scrapeSpotify(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`)

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://open.spotify.com/album/1Mo4aZ8pdj6L1jx8zSwJnt",
          "categories": [
            "album",
            "spotify",
          ],
          "contentId": "1Mo4aZ8pdj6L1jx8zSwJnt",
          "creator": null,
          "description": null,
          "hashtags": [],
          "imageUrl": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e025076e4160d018e378f488c33",
          "rawData": {
            "height": 352,
            "html": "<iframe style="border-radius: 12px" width="100%" height="352" title="Spotify Embed: THE TORTURED POETS DEPARTMENT" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" src="https://open.spotify.com/embed/album/1Mo4aZ8pdj6L1jx8zSwJnt?utm_source=oembed"></iframe>",
            "iframe_url": "https://open.spotify.com/embed/album/1Mo4aZ8pdj6L1jx8zSwJnt?utm_source=oembed",
            "provider_name": "Spotify",
            "provider_url": "https://spotify.com",
            "thumbnail_height": 300,
            "thumbnail_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e025076e4160d018e378f488c33",
            "thumbnail_width": 300,
            "title": "THE TORTURED POETS DEPARTMENT",
            "type": "rich",
            "version": "1.0",
            "width": 456,
          },
          "suggestedKeywords": [],
          "title": "THE TORTURED POETS DEPARTMENT",
        }
      `)
    })

    it('scrapes artist page', async () => {
      // Taylor Swift
      const url = 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02'
      const result = await scrapeSpotify(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`)

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02",
          "categories": [
            "artist",
            "spotify",
          ],
          "contentId": "06HL4z0CvFAxyc27GXpf02",
          "creator": null,
          "description": null,
          "hashtags": [],
          "imageUrl": "https://image-cdn-ak.spotifycdn.com/image/ab67616100005174e2e8e7ff002a4afda1c7147e",
          "rawData": {
            "height": 352,
            "html": "<iframe style="border-radius: 12px" width="100%" height="352" title="Spotify Embed: Taylor Swift" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" src="https://open.spotify.com/embed/artist/06HL4z0CvFAxyc27GXpf02?utm_source=oembed"></iframe>",
            "iframe_url": "https://open.spotify.com/embed/artist/06HL4z0CvFAxyc27GXpf02?utm_source=oembed",
            "provider_name": "Spotify",
            "provider_url": "https://spotify.com",
            "thumbnail_height": 320,
            "thumbnail_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616100005174e2e8e7ff002a4afda1c7147e",
            "thumbnail_width": 320,
            "title": "Taylor Swift",
            "type": "rich",
            "version": "1.0",
            "width": 456,
          },
          "suggestedKeywords": [],
          "title": "Taylor Swift",
        }
      `)
    })

    it('scrapes track page', async () => {
      // Anti-Hero
      const url = 'https://open.spotify.com/track/0V3wPSX9ygBnCm8psDIegu'
      const result = await scrapeSpotify(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`)

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://open.spotify.com/track/0V3wPSX9ygBnCm8psDIegu",
          "categories": [
            "track",
            "spotify",
          ],
          "contentId": "0V3wPSX9ygBnCm8psDIegu",
          "creator": null,
          "description": null,
          "hashtags": [],
          "imageUrl": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02bb54dde68cd23e2a268ae0f5",
          "rawData": {
            "height": 152,
            "html": "<iframe style="border-radius: 12px" width="100%" height="152" title="Spotify Embed: Anti-Hero" frameborder="0" allowfullscreen allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" src="https://open.spotify.com/embed/track/0V3wPSX9ygBnCm8psDIegu?utm_source=oembed"></iframe>",
            "iframe_url": "https://open.spotify.com/embed/track/0V3wPSX9ygBnCm8psDIegu?utm_source=oembed",
            "provider_name": "Spotify",
            "provider_url": "https://spotify.com",
            "thumbnail_height": 300,
            "thumbnail_url": "https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02bb54dde68cd23e2a268ae0f5",
            "thumbnail_width": 300,
            "title": "Anti-Hero",
            "type": "rich",
            "version": "1.0",
            "width": 456,
          },
          "suggestedKeywords": [],
          "title": "Anti-Hero",
        }
      `)
    })

    it('returns error for invalid URL', async () => {
      const url = 'https://open.spotify.com/invalid/path'
      const result = await scrapeSpotify(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('Expected failure')

      expect(result.error.type).toBe('parse')
    })
  })
})
