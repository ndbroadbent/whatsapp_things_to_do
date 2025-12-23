/**
 * Eventbrite Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * First run makes real requests and saves fixtures.
 * Subsequent runs replay from fixtures (instant, offline).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { scrapeEventbrite } from './eventbrite'
import { HttpRecorder } from './test-support/http-recorder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'eventbrite')

describe('Eventbrite Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeEventbrite', () => {
    it('scrapes event metadata', async () => {
      const url =
        'https://www.eventbrite.co.nz/e/come-as-you-are-a-night-of-acoustic-nirvana-tickets-189496869237'
      const result = await scrapeEventbrite(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Expected success')

      expect(result.metadata.contentId).toBe('189496869237')
      expect(result.metadata.canonicalUrl).toBe(url)
      expect(result.metadata.title).toBe('Come As You Are -  A Night Of Acoustic Nirvana')
      expect(result.metadata.description).toBe('McLean, Elis, Banham and Teegs.')
      expect(result.metadata.thumbnailUrl).toContain('img.evbuc.com')
      expect(result.metadata.categories).toContain('event')
    })
  })
})
