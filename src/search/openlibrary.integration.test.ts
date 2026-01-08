/**
 * Open Library Search Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * Tests book entity resolution with cover images.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from '../scraper/test-support/http-recorder'
import { searchOpenLibrary } from './openlibrary'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'openlibrary')

describe('Open Library Search Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('searchOpenLibrary', () => {
    it('finds Pride and Prejudice with cover', async () => {
      const result = await searchOpenLibrary('Pride and Prejudice', 'Jane Austen', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.title).toContain('Pride and Prejudice')
      expect(result?.author).toContain('Austen')
      expect(result?.coverUrl).toBeDefined()
      expect(result?.workId).toMatch(/^OL\d+W$/)
    })

    it('finds 1984 by George Orwell', async () => {
      const result = await searchOpenLibrary('1984', 'George Orwell', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.title).toMatch(/1984|Nineteen Eighty/i)
      expect(result?.author).toContain('Orwell')
      expect(result?.workId).toBeDefined()
    })

    it('finds The Hobbit without author hint', async () => {
      const result = await searchOpenLibrary('The Hobbit', undefined, {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.title).toContain('Hobbit')
      expect(result?.author).toContain('Tolkien')
    })

    it('finds Project Hail Mary by Andy Weir', async () => {
      const result = await searchOpenLibrary('Project Hail Mary', 'Andy Weir', {
        customFetch: recorder.fetch
      })

      expect(result).not.toBeNull()
      expect(result?.title).toContain('Project Hail Mary')
      expect(result?.author).toContain('Weir')
    })

    it('returns null for non-existent book', async () => {
      const result = await searchOpenLibrary('xyznonexistentbook12345', undefined, {
        customFetch: recorder.fetch
      })

      expect(result).toBeNull()
    })
  })
})
