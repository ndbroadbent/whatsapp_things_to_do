/**
 * Generic Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { scrapeGeneric } from './generic'
import { HttpRecorder } from './test-support/http-recorder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'generic')

describe('Generic Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeGeneric', () => {
    it('scrapes hotel website metadata', async () => {
      const url = 'https://kalimaresort.com/'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Expected success')

      expect(result.metadata.title).toBe('Kalima Resort & Spa - 5-Star Resort in Phuket')
      expect(result.metadata.description).toContain('Kalima Resort')
      expect(result.metadata.description).toContain('Phuket')
      expect(result.metadata.thumbnailUrl).toContain('kalimaresort.com')
      expect(result.metadata.categories).toContain('kalimaresort.com')
    })

    it('returns finalUrl when shortened URL redirects to unreachable domain', async () => {
      // tinyurl redirects to fake domain - scraping fails but we get the final URL
      // The path /blog/go-hiking-at-yellowstone-tips contains valuable info
      const url = 'https://tinyurl.com/a6vzxrj4'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('Expected failure')

      expect(result.error.url).toBe(url)
      expect(result.error.finalUrl).toBe(
        'https://fakesiteexample.com/blog/go-hiking-at-yellowstone-tips'
      )
    })
  })
})
