/**
 * TikTok Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * First run makes real requests and saves fixtures.
 * Subsequent runs replay from fixtures (instant, offline).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from './test-support/http-recorder'
import { resolveTikTokUrl, scrapeTikTok } from './tiktok'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'tiktok')

describe('TikTok Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('resolveTikTokUrl', () => {
    it('resolves short URL to canonical URL with video ID', async () => {
      const shortUrl = 'https://vt.tiktok.com/ZS6myoDYu/'
      const result = await resolveTikTokUrl(shortUrl, { fetch: recorder.fetch })

      expect(result.canonicalUrl).toContain('tiktok.com')
      expect(result.canonicalUrl).toContain('/video/')
      expect(result.videoId).toBe('7455066896669461782')
    })
  })

  describe('scrapeTikTok', () => {
    it('scrapes accordion video metadata', async () => {
      const url = 'https://vt.tiktok.com/ZS6myoDYu/'
      const result = await scrapeTikTok(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Content ID
        expect(result.metadata.contentId).toBe('7455066896669461782')

        // Title - extracted from video description
        expect(result.metadata.title).toBe('Shostakovich: Waltz No. 2')

        // Description includes hashtags
        expect(result.metadata.description).toContain('Shostakovich')
        expect(result.metadata.description).toContain('#classicalmusic')

        // Creator username
        expect(result.metadata.creator).toBe('sergey.sadovoy.ffm')

        // Categories from TikTok's diversificationLabels
        expect(result.metadata.categories).toContain('Singing & Instruments')
        expect(result.metadata.categories).toContain('Talents')

        // Suggested keywords
        expect(result.metadata.suggestedKeywords).toContain('Classical Music')
        expect(result.metadata.suggestedKeywords).toContain('Accordion')

        // Thumbnail URL
        expect(result.metadata.imageUrl).toContain('tiktokcdn')
      }
    })

    it('extracts hashtags from video description', async () => {
      const url = 'https://vt.tiktok.com/ZS6myoDYu/'
      const result = await scrapeTikTok(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.hashtags).toContain('classicalmusic')
        expect(result.metadata.hashtags).toContain('accordion')
        expect(result.metadata.hashtags).toContain('bach')
        expect(result.metadata.hashtags).toContain('mozart')
        expect(result.metadata.hashtags.length).toBeGreaterThanOrEqual(10)
      }
    })
  })
})
