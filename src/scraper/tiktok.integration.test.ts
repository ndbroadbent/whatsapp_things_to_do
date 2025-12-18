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
import { HttpRecorder } from './test-support/http-recorder.js'
import { resolveTikTokUrl, scrapeTikTok } from './tiktok.js'

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
        expect(result.metadata.platform).toBe('tiktok')
        expect(result.metadata.contentId).toBe('7455066896669461782')

        const allText = [
          result.metadata.title ?? '',
          result.metadata.description ?? '',
          ...result.metadata.hashtags,
          ...result.metadata.categories,
          ...result.metadata.suggestedKeywords
        ]
          .join(' ')
          .toLowerCase()

        expect(
          allText.includes('accordion') ||
            allText.includes('music') ||
            allText.includes('instrument') ||
            allText.includes('waltz')
        ).toBe(true)

        expect(result.metadata.creator).toBeTruthy()
      }
    })

    it('extracts hashtags from video', async () => {
      const url = 'https://vt.tiktok.com/ZS6myoDYu/'
      const result = await scrapeTikTok(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.hashtags.length).toBeGreaterThan(0)
      }
    })
  })
})
