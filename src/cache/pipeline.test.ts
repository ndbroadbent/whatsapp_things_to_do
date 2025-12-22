/**
 * Pipeline Cache Tests
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hashContent, PipelineCache } from './pipeline.js'

describe('PipelineCache', () => {
  let tempDir: string
  let cache: PipelineCache

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pipeline-cache-test-'))
    cache = new PipelineCache(tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('hashContent', () => {
    it('generates consistent hash for same content', () => {
      const content = 'Hello, world!'
      const hash1 = hashContent(content)
      const hash2 = hashContent(content)
      expect(hash1).toBe(hash2)
    })

    it('generates different hash for different content', () => {
      const hash1 = hashContent('Hello')
      const hash2 = hashContent('World')
      expect(hash1).not.toBe(hash2)
    })

    it('returns 16-character hex string', () => {
      const hash = hashContent('test')
      expect(hash).toMatch(/^[a-f0-9]{16}$/)
    })
  })

  describe('initRun', () => {
    it('creates run directory', () => {
      const run = cache.initRun('test-chat.zip', 'chat content')
      expect(run.runDir).toContain('test-chat')
      expect(run.contentHash).toBe(hashContent('chat content'))
    })

    it('sanitizes filename', () => {
      const run = cache.initRun('WhatsApp Chat - John Doe.zip', 'content')
      expect(run.runDir).toContain('WhatsApp_Chat_-_John_Doe')
    })

    it('sets current run', () => {
      cache.initRun('test.zip', 'content')
      expect(cache.getCurrentRun()).not.toBeNull()
    })
  })

  describe('findLatestRun', () => {
    it('returns null when no runs exist', () => {
      const run = cache.findLatestRun('test.zip', 'content')
      expect(run).toBeNull()
    })

    it('finds existing run with matching hash', () => {
      const content = 'test content'
      cache.initRun('test.zip', content)

      // Create new cache instance
      const cache2 = new PipelineCache(tempDir)
      const run = cache2.findLatestRun('test.zip', content)

      expect(run).not.toBeNull()
      expect(run?.contentHash).toBe(hashContent(content))
    })

    it('returns null for different content hash', () => {
      cache.initRun('test.zip', 'original content')

      const cache2 = new PipelineCache(tempDir)
      const run = cache2.findLatestRun('test.zip', 'different content')

      expect(run).toBeNull()
    })
  })

  describe('getOrCreateRun', () => {
    it('creates new run when none exists', () => {
      const run = cache.getOrCreateRun('test.zip', 'content')
      expect(run).not.toBeNull()
      expect(run.contentHash).toBe(hashContent('content'))
    })

    it('reuses existing run with matching hash', () => {
      const content = 'test content'
      const run1 = cache.initRun('test.zip', content)

      const cache2 = new PipelineCache(tempDir)
      const run2 = cache2.getOrCreateRun('test.zip', content)

      expect(run2.runDir).toBe(run1.runDir)
    })
  })

  describe('stage operations', () => {
    beforeEach(() => {
      cache.initRun('test.zip', 'content')
    })

    it('hasStage returns false for missing stage', () => {
      expect(cache.hasStage('messages')).toBe(false)
    })

    it('hasStage returns true after setStage', () => {
      cache.setStage('messages', [{ id: 1 }])
      expect(cache.hasStage('messages')).toBe(true)
    })

    it('getStage returns null for missing stage', () => {
      expect(cache.getStage('messages')).toBeNull()
    })

    it('getStage returns saved data', () => {
      const data = [{ id: 1, text: 'Hello' }]
      cache.setStage('messages', data)

      const retrieved = cache.getStage<typeof data>('messages')
      expect(retrieved).toEqual(data)
    })

    it('handles chat stage as plain text', () => {
      const chatText = 'This is raw chat text'
      cache.setStage('chat', chatText)

      const retrieved = cache.getStage<string>('chat')
      expect(retrieved).toBe(chatText)
    })

    it('stores complex objects as JSON', () => {
      const data = {
        candidates: [{ id: 1, content: 'test' }],
        stats: { total: 1 }
      }
      cache.setStage('candidates.all', data)

      const retrieved = cache.getStage<typeof data>('candidates.all')
      expect(retrieved).toEqual(data)
    })

    it('throws when no run initialized', () => {
      const freshCache = new PipelineCache(tempDir)
      expect(() => freshCache.setStage('messages', [])).toThrow('Pipeline run not initialized')
    })
  })

  describe('getRunDir', () => {
    it('returns null before initialization', () => {
      expect(cache.getRunDir()).toBeNull()
    })

    it('returns directory after initialization', () => {
      cache.initRun('test.zip', 'content')
      expect(cache.getRunDir()).toContain('test')
    })
  })

  describe('listRuns', () => {
    it('returns empty array when no runs exist', () => {
      const runs = cache.listRuns('test.zip')
      expect(runs).toEqual([])
    })

    it('lists all runs for an input file', () => {
      cache.initRun('test.zip', 'content1')
      cache.initRun('test.zip', 'content2')
      cache.initRun('test.zip', 'content3')

      const cache2 = new PipelineCache(tempDir)
      const runs = cache2.listRuns('test.zip')

      expect(runs.length).toBe(3)
    })

    it('sorts runs by datetime descending', () => {
      cache.initRun('test.zip', 'content1')
      cache.initRun('test.zip', 'content2')

      const cache2 = new PipelineCache(tempDir)
      const runs = cache2.listRuns('test.zip')

      expect(runs.length).toBeGreaterThanOrEqual(2)
      // Sorted descending, so first date should be >= second date
      const firstDate = runs[0]?.createdAt ?? ''
      const secondDate = runs[1]?.createdAt ?? ''
      expect(firstDate >= secondDate).toBe(true)
    })
  })
})
