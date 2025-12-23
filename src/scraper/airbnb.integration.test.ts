/**
 * Airbnb Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { scrapeAirbnb } from './airbnb'
import { HttpRecorder } from './test-support/http-recorder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'airbnb')

describe('Airbnb Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeAirbnb', () => {
    it('scrapes room listing metadata', async () => {
      const url = 'https://www.airbnb.com/rooms/29688831'
      const result = await scrapeAirbnb(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Expected success')

      expect(result.metadata.contentId).toBe('29688831')
      expect(result.metadata.title).toContain('Queenstown')
      expect(result.metadata.title).toContain('4.99')
      expect(result.metadata.description).toBe('Above and Beyond')
      expect(result.metadata.thumbnailUrl).toContain('muscache.com')
    })
  })
})
