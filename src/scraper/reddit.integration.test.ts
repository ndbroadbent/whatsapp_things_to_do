/**
 * Reddit Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * First run makes real requests and saves fixtures.
 * Subsequent runs replay from fixtures (instant, offline).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { scrapeReddit } from './reddit'
import { HttpRecorder } from './test-support/http-recorder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'reddit')

describe('Reddit Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeReddit', () => {
    it('scrapes oddlysatisfying post metadata', async () => {
      const url =
        'https://www.reddit.com/r/oddlysatisfying/comments/1amvnvg/most_satisfying_affogato_ive_seen/'
      const result = await scrapeReddit(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.contentId).toBe('1amvnvg')
        expect(result.metadata.title).toContain('affogato')
        expect(result.metadata.creator).toBe('DigMeTX')
        expect(result.metadata.categories).toContain('r/oddlysatisfying')
      }
    })

    it('resolves short share URL and scrapes metadata', async () => {
      // This short URL redirects to the full post URL
      const url = 'https://www.reddit.com/r/oddlysatisfying/s/6jHbC0UQEi'
      const result = await scrapeReddit(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.metadata.contentId).toBe('1amvnvg')
        expect(result.metadata.title).toBeTruthy()
        expect(result.metadata.creator).toBeTruthy()
      }
    })
  })
})
