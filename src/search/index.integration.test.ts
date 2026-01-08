/**
 * Entity Resolution Integration Tests
 *
 * Tests the full resolveEntity pipeline.
 * Ensures results with external IDs (BGG, IMDB, Steam) are returned
 * even if they lack imageUrl or wikipediaUrl.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from '../scraper/test-support/http-recorder'
import { resolveEntity } from './index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'entity-resolution')

describe('Entity Resolution Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('resolveEntity', () => {
    it('resolves Blood on the Clocktower to BGG URL', async () => {
      const result = await resolveEntity('Blood on the Clocktower', 'physical_game', {
        wikidata: true,
        customFetch: recorder.createNamedFetch('wikidata-blood-clocktower')
      })

      expect(result).not.toBeNull()
      expect(result?.url).toContain('boardgamegeek.com')
      expect(result?.externalIds?.bgg).toBe('240980')
    })

    it('resolves games with BGG ID even without Wikipedia/image', async () => {
      // This tests that we don't reject Wikidata results just because
      // they lack imageUrl or wikipediaUrl - the BGG ID is sufficient
      const result = await resolveEntity('Blood on the Clocktower', 'physical_game', {
        wikidata: true,
        openlibrary: false,
        googleSearch: undefined,
        aiClassification: undefined,
        customFetch: recorder.createNamedFetch('wikidata-blood-clocktower')
      })

      expect(result).not.toBeNull()
      expect(result?.source).toBe('wikidata')
      expect(result?.url).toContain('boardgamegeek.com/boardgame/240980')
    })
  })
})
