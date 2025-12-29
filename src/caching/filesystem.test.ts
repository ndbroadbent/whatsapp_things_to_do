import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FilesystemCache } from './filesystem'
import type { CachedResponse } from './types'

describe('FilesystemCache', () => {
  let testDir: string
  let cache: FilesystemCache

  beforeEach(() => {
    testDir = join(tmpdir(), `cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    cache = new FilesystemCache(testDir)
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  describe('get', () => {
    it('should return null for non-existent key', async () => {
      const result = await cache.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should return cached value', async () => {
      const hash = 'abc123'
      const response: CachedResponse<string> = {
        data: 'test data',
        cachedAt: Date.now()
      }

      await cache.set(hash, response)
      const result = await cache.get<string>(hash)

      expect(result).not.toBeNull()
      expect(result?.data).toBe('test data')
    })
  })

  describe('set', () => {
    it('should create cache directory if not exists', async () => {
      const hash = 'newdir123'
      const response: CachedResponse<string> = {
        data: 'test',
        cachedAt: Date.now()
      }

      await cache.set(hash, response)

      const expectedDir = join(testDir, 'requests', hash.slice(0, 2))
      expect(existsSync(expectedDir)).toBe(true)
    })

    it('should store complex objects', async () => {
      const hash = 'complex123'
      const complexData = {
        embeddings: [0.1, 0.2, 0.3],
        metadata: {
          model: 'text-embedding-3-large',
          tokens: 10
        }
      }
      const response: CachedResponse<typeof complexData> = {
        data: complexData,
        cachedAt: Date.now()
      }

      await cache.set(hash, response)
      const result = await cache.get<typeof complexData>(hash)

      expect(result?.data).toEqual(complexData)
    })

    it('should overwrite existing entry', async () => {
      const hash = 'overwrite123'
      const response1: CachedResponse<string> = {
        data: 'first',
        cachedAt: Date.now()
      }
      const response2: CachedResponse<string> = {
        data: 'second',
        cachedAt: Date.now()
      }

      await cache.set(hash, response1)
      await cache.set(hash, response2)

      const result = await cache.get<string>(hash)
      expect(result?.data).toBe('second')
    })

    it('should handle arrays', async () => {
      const hash = 'array123'
      const data = ['a', 'b', 'c']
      const response: CachedResponse<string[]> = {
        data,
        cachedAt: Date.now()
      }

      await cache.set(hash, response)
      const result = await cache.get<string[]>(hash)

      expect(result?.data).toEqual(data)
    })
  })

  describe('clear', () => {
    it('should remove all cached entries', async () => {
      // Add some entries
      await cache.set('key1', { data: 'val1', cachedAt: Date.now() })
      await cache.set('key2', { data: 'val2', cachedAt: Date.now() })

      await cache.clear()

      expect(await cache.get('key1')).toBeNull()
      expect(await cache.get('key2')).toBeNull()
    })

    it('should not fail when cache dir does not exist', async () => {
      const emptyCache = new FilesystemCache(join(testDir, 'nonexistent'))
      // Should resolve without throwing
      await emptyCache.clear()
    })
  })

  describe('file organization', () => {
    it('should organize files by hash prefix', async () => {
      const hash1 = 'aabbcc1234567890'
      const hash2 = 'aabbdd1234567890'
      const hash3 = 'ccddee1234567890'

      await cache.set(hash1, { data: 'v1', cachedAt: Date.now() })
      await cache.set(hash2, { data: 'v2', cachedAt: Date.now() })
      await cache.set(hash3, { data: 'v3', cachedAt: Date.now() })

      // hash1 and hash2 should be in same directory (prefix 'aa')
      expect(existsSync(join(testDir, 'requests', 'aa', `${hash1}.json`))).toBe(true)
      expect(existsSync(join(testDir, 'requests', 'aa', `${hash2}.json`))).toBe(true)

      // hash3 should be in different directory (prefix 'cc')
      expect(existsSync(join(testDir, 'requests', 'cc', `${hash3}.json`))).toBe(true)
    })
  })

  describe('error handling', () => {
    it('should return null for corrupted cache file', async () => {
      const hash = 'corrupt123'
      const path = join(testDir, 'requests', hash.slice(0, 2), `${hash}.json`)

      // Create corrupted file
      mkdirSync(join(testDir, 'requests', hash.slice(0, 2)), { recursive: true })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(path, 'not valid json{{{')

      const result = await cache.get(hash)
      expect(result).toBeNull()
    })
  })
})
