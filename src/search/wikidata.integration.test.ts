/**
 * Wikidata Search Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * Tests entity resolution with external ID extraction.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from '../scraper/test-support/http-recorder'
import { searchWikidata } from './wikidata'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'wikidata')

describe('Wikidata Search Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('searchWikidata', () => {
    it("finds Baldur's Gate 3 with Steam ID", async () => {
      const result = await searchWikidata("Baldur's Gate 3", 'video_game', {
        customFetch: recorder.createNamedFetch('baldurs-gate-3')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toContain("Baldur's Gate")
      expect(result?.externalIds?.steam).toBe('1086940')
    })

    it('finds Interstellar with IMDB ID', async () => {
      const result = await searchWikidata('Interstellar', 'movie', {
        customFetch: recorder.createNamedFetch('interstellar')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toContain('Interstellar')
      expect(result?.externalIds?.imdb).toMatch(/^tt\d+$/)
    })

    it('finds Wingspan board game with BGG ID', async () => {
      const result = await searchWikidata('Wingspan', 'physical_game', {
        customFetch: recorder.createNamedFetch('wingspan')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toBe('Wingspan')
      expect(result?.externalIds?.bgg).toBeDefined()
    })

    it('finds The Tortured Poets Department album with Spotify ID', async () => {
      const result = await searchWikidata('The Tortured Poets Department', 'album', {
        customFetch: recorder.createNamedFetch('tortured-poets-department')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toContain('Tortured Poets')
      // Album may have Spotify or MusicBrainz ID
      const hasExternalId =
        result?.externalIds?.spotify_album || result?.externalIds?.musicbrainz_release_group
      expect(hasExternalId).toBeDefined()
    })

    it('finds The Matrix with IMDB ID', async () => {
      const result = await searchWikidata('The Matrix', 'movie', {
        customFetch: recorder.createNamedFetch('the-matrix')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toBe('The Matrix')
      expect(result?.externalIds?.imdb).toBe('tt0133093')
    })

    it('finds Catan board game with BGG ID', async () => {
      const result = await searchWikidata('Catan', 'physical_game', {
        customFetch: recorder.createNamedFetch('catan')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toMatch(/Catan/i)
      expect(result?.externalIds?.bgg).toBeDefined()
    })

    it('finds Blood on the Clocktower with BGG ID', async () => {
      const result = await searchWikidata('Blood on the Clocktower', 'physical_game', {
        customFetch: recorder.createNamedFetch('blood-on-clocktower')
      })

      expect(result).not.toBeNull()
      expect(result?.label).toMatch(/Blood on the Clocktower/i)
      expect(result?.externalIds?.bgg).toBeDefined()
    })

    it('returns null for non-existent entity', async () => {
      const result = await searchWikidata('xyznonexistententity123', 'movie', {
        customFetch: recorder.createNamedFetch('nonexistent')
      })

      expect(result).toBeNull()
    })

    it('finds The Bear (2022 TV series, not episode)', async () => {
      const result = await searchWikidata('The Bear', 'tv_show', {
        customFetch: recorder.createNamedFetch('the-bear')
      })

      expect(result).not.toBeNull()
      // Should be the 2022 FX TV series (Q112761982), not an episode from another show
      expect(result?.qid).toBe('Q112761982')
      expect(result?.label).toBe('The Bear')
      expect(result?.description).toBe('American comedy television series')
      expect(result?.externalIds?.imdb).toBe('tt14452776')
    })

    it('finds Oppenheimer (2023 film, not Norman)', async () => {
      const result = await searchWikidata('Oppenheimer', 'movie', {
        customFetch: recorder.createNamedFetch('oppenheimer')
      })

      expect(result).not.toBeNull()
      // Should be the 2023 Nolan film, not "Norman (2016)"
      expect(result?.label).toBe('Oppenheimer')
      expect(result?.externalIds?.imdb).toBe('tt15398776')
    })
  })
})
