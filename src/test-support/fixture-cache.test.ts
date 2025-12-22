/**
 * Tests for FixtureCache
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FixtureCache } from './fixture-cache'

describe('FixtureCache', () => {
  let tempDir: string
  let fixturePath: string

  beforeEach(() => {
    tempDir = join(tmpdir(), `fixture-cache-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    fixturePath = join(tempDir, 'test-cache.json.gz')
  })

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  describe('load', () => {
    it('should start empty when fixture does not exist', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      expect(cache.size).toBe(0)
    })

    it('should load existing fixture', async () => {
      // Create a fixture file
      const data = {
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        entries: {
          abc123: { response: { data: 'test-data', cachedAt: 1234567890 } }
        }
      }
      const json = JSON.stringify(data)
      const compressed = gzipSync(json)
      writeFileSync(fixturePath, new Uint8Array(compressed))

      const cache = new FixtureCache(fixturePath)
      await cache.load()

      expect(cache.size).toBe(1)
      expect(cache.has('abc123')).toBe(true)
    })

    it('should only load once', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()
      await cache.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)
      await cache.load() // Should not reset

      expect(cache.size).toBe(1)
    })
  })

  describe('get/set', () => {
    it('should store and retrieve values', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      const response = { data: { embedding: [1, 2, 3] }, cachedAt: Date.now() }
      await cache.set('hash123', response, 3600)

      const retrieved = await cache.get<{ embedding: number[] }>('hash123')
      expect(retrieved).toEqual(response)
    })

    it('should return null for missing keys', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      const result = await cache.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should auto-load on get if not loaded', async () => {
      const cache = new FixtureCache(fixturePath)
      // Don't call load()

      const result = await cache.get('anything')
      expect(result).toBeNull()
      expect(cache.size).toBe(0)
    })

    it('should auto-load on set if not loaded', async () => {
      const cache = new FixtureCache(fixturePath)
      // Don't call load()

      await cache.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)
      expect(cache.size).toBe(1)
    })

    it('should ignore TTL (fixtures never expire)', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      // Set with very short TTL
      const response = { data: 'test', cachedAt: Date.now() - 100000 }
      await cache.set('old-entry', response, 1)

      // Should still be retrievable
      const retrieved = await cache.get('old-entry')
      expect(retrieved).toEqual(response)
    })
  })

  describe('save', () => {
    it('should save new entries to disk', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      await cache.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)
      await cache.set('key2', { data: 'value2', cachedAt: Date.now() }, 60)
      await cache.save()

      // Load in a new instance
      const cache2 = new FixtureCache(fixturePath)
      await cache2.load()

      expect(cache2.size).toBe(2)
      expect(cache2.has('key1')).toBe(true)
      expect(cache2.has('key2')).toBe(true)
    })

    it('should not write if nothing changed', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()
      await cache.save()

      expect(existsSync(fixturePath)).toBe(false)
    })

    it('should be additive (preserve existing entries)', async () => {
      // First run: add some entries
      const cache1 = new FixtureCache(fixturePath)
      await cache1.load()
      await cache1.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)
      await cache1.save()

      // Second run: add more entries
      const cache2 = new FixtureCache(fixturePath)
      await cache2.load()
      await cache2.set('key2', { data: 'value2', cachedAt: Date.now() }, 60)
      await cache2.save()

      // Third run: verify all entries exist
      const cache3 = new FixtureCache(fixturePath)
      await cache3.load()

      expect(cache3.size).toBe(2)
      expect(cache3.has('key1')).toBe(true)
      expect(cache3.has('key2')).toBe(true)
    })

    it('should create parent directories if needed', async () => {
      const nestedPath = join(tempDir, 'nested', 'deep', 'cache.json.gz')
      const cache = new FixtureCache(nestedPath)
      await cache.load()
      await cache.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)
      await cache.save()

      expect(existsSync(nestedPath)).toBe(true)
    })
  })

  describe('isDirty', () => {
    it('should be false initially', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      expect(cache.isDirty).toBe(false)
    })

    it('should be true after adding new entry', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()
      await cache.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)

      expect(cache.isDirty).toBe(true)
    })

    it('should be false after save', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()
      await cache.set('key1', { data: 'value1', cachedAt: Date.now() }, 60)
      await cache.save()

      expect(cache.isDirty).toBe(false)
    })

    it('should not be dirty when setting existing key', async () => {
      // Create fixture with existing entry
      const data = {
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        entries: {
          key1: { response: { data: 'old-value', cachedAt: 1234567890 } }
        }
      }
      writeFileSync(fixturePath, new Uint8Array(gzipSync(JSON.stringify(data))))

      const cache = new FixtureCache(fixturePath)
      await cache.load()

      // Set the same key (update)
      await cache.set('key1', { data: 'new-value', cachedAt: Date.now() }, 60)

      // Should not be dirty since key already existed
      expect(cache.isDirty).toBe(false)
    })
  })

  describe('keys', () => {
    it('should return all cached keys', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      await cache.set('key1', { data: 'v1', cachedAt: Date.now() }, 60)
      await cache.set('key2', { data: 'v2', cachedAt: Date.now() }, 60)
      await cache.set('key3', { data: 'v3', cachedAt: Date.now() }, 60)

      const keys = cache.keys()
      expect(keys).toHaveLength(3)
      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
      expect(keys).toContain('key3')
    })
  })

  describe('clear', () => {
    it('should remove all entries', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      await cache.set('key1', { data: 'v1', cachedAt: Date.now() }, 60)
      await cache.set('key2', { data: 'v2', cachedAt: Date.now() }, 60)

      cache.clear()

      expect(cache.size).toBe(0)
      expect(cache.isDirty).toBe(true)
    })
  })

  describe('ResponseCache interface compatibility', () => {
    it('should work with embeddings-style caching', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      // Simulate how embeddings module uses the cache
      const embeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6]
      ]
      const response = {
        data: embeddings,
        cachedAt: Date.now()
      }

      await cache.set('embedding-hash-123', response, 900) // 15 min TTL

      const retrieved = await cache.get<number[][]>('embedding-hash-123')
      expect(retrieved?.data).toEqual(embeddings)
    })

    it('should work with classifier-style caching', async () => {
      const cache = new FixtureCache(fixturePath)
      await cache.load()

      // Simulate classifier response
      const classifierResult = {
        activity: 'hiking',
        category: 'outdoor',
        isMappable: true
      }
      const response = {
        data: classifierResult,
        cachedAt: Date.now()
      }

      await cache.set('classifier-hash-456', response, 900)

      const retrieved = await cache.get<typeof classifierResult>('classifier-hash-456')
      expect(retrieved?.data.activity).toBe('hiking')
    })
  })
})
