/**
 * YouTube Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * First run makes real requests and saves fixtures.
 * Subsequent runs replay from fixtures (instant, offline).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from './test-support/http-recorder'
import { scrapeYouTube } from './youtube'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'youtube')

describe('YouTube Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeYouTube', () => {
    it('scrapes cooking video metadata', async () => {
      // From chat: "would you like me to cook this?"
      const url = 'https://www.youtube.com/watch?v=oQ-Vc_xQrZk'
      const result = await scrapeYouTube(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.contentId).toBe('oQ-Vc_xQrZk')
        expect(result.metadata.canonicalUrl).toBe('https://www.youtube.com/watch?v=oQ-Vc_xQrZk')
        expect(result.metadata.title).toBeTruthy()
        expect(result.metadata.creator).toBeTruthy()
      }
    })

    it('extracts video description and keywords', async () => {
      const url = 'https://www.youtube.com/watch?v=oQ-Vc_xQrZk'
      const result = await scrapeYouTube(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        // Video should have some description
        expect(result.metadata.description).toBeTruthy()
        // YouTube videos typically have thumbnail
        expect(result.metadata.thumbnailUrl).toBeTruthy()
      }
    })
  })
})
