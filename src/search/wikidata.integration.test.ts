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
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.label).toContain("Baldur's Gate")
      expect(result?.externalIds?.steamId).toBe('1086940')
    })

    it('finds Interstellar with IMDB ID', async () => {
      const result = await searchWikidata('Interstellar', 'movie', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.label).toContain('Interstellar')
      expect(result?.externalIds?.imdbId).toMatch(/^tt\d+$/)
    })

    it('finds Wingspan board game with BGG ID', async () => {
      const result = await searchWikidata('Wingspan', 'physical_game', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.label).toBe('Wingspan')
      expect(result?.externalIds?.bggId).toBeDefined()
    })

    it('finds The Tortured Poets Department album with Spotify ID', async () => {
      const result = await searchWikidata('The Tortured Poets Department', 'album', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.label).toContain('Tortured Poets')
      // Album may have Spotify or MusicBrainz ID
      const hasExternalId =
        result?.externalIds?.spotifyAlbumId || result?.externalIds?.musicbrainzReleaseGroupId
      expect(hasExternalId).toBeDefined()
    })

    it('finds The Matrix with IMDB ID', async () => {
      const result = await searchWikidata('The Matrix', 'movie', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.label).toBe('The Matrix')
      expect(result?.externalIds?.imdbId).toBe('tt0133093')
    })

    it('finds Catan board game with BGG ID', async () => {
      const result = await searchWikidata('Catan', 'physical_game', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.label).toMatch(/Catan/i)
      expect(result?.externalIds?.bggId).toBeDefined()
    })

    it('returns null for non-existent entity', async () => {
      const result = await searchWikidata('xyznonexistententity123', 'movie', {
        customFetch: recorder.fetch
      })

      expect(result).toBeNull()
    })

    it('finds The Bear (2022 TV series, not episode)', async () => {
      const result = await searchWikidata('The Bear', 'tv_show', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      // Should be the 2022 FX TV series (Q112761982), not an episode from another show
      expect(result?.qid).toBe('Q112761982')
      expect(result?.label).toBe('The Bear')
      expect(result?.description).toBe('American comedy television series')
      expect(result?.externalIds?.imdbId).toBe('tt14452776')
    })

    it('finds Oppenheimer (2023 film, not Norman)', async () => {
      const result = await searchWikidata('Oppenheimer', 'movie', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      // Should be the 2023 Nolan film, not "Norman (2016)"
      expect(result?.label).toBe('Oppenheimer')
      expect(result?.externalIds?.imdbId).toBe('tt15398776')
    })
  })
})
