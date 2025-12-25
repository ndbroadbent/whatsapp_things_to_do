/**
 * Pipeline Cache Tests
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PipelineCache } from './pipeline'

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

  describe('initRun', () => {
    it('creates run directory', () => {
      const run = cache.initRun('test-chat.zip', 'abc123def456')
      expect(run.runDir).toContain('test-chat')
      expect(run.fileHash).toBe('abc123def456')
    })

    it('sanitizes filename', () => {
      const run = cache.initRun('WhatsApp Chat - John Doe.zip', 'hash123')
      expect(run.runDir).toContain('WhatsApp_Chat_-_John_Doe')
    })

    it('sets current run', () => {
      cache.initRun('test.zip', 'hash123')
      expect(cache.getCurrentRun()).not.toBeNull()
    })
  })

  describe('findLatestRun', () => {
    it('returns null when no runs exist', () => {
      const run = cache.findLatestRun('test.zip', 'hash123')
      expect(run).toBeNull()
    })

    it('finds existing run with matching hash', () => {
      const fileHash = 'abc123def456'
      cache.initRun('test.zip', fileHash)

      // Create new cache instance
      const cache2 = new PipelineCache(tempDir)
      const run = cache2.findLatestRun('test.zip', fileHash)

      expect(run).not.toBeNull()
      expect(run?.fileHash).toBe(fileHash)
    })

    it('returns null for different hash', () => {
      cache.initRun('test.zip', 'original_hash')

      const cache2 = new PipelineCache(tempDir)
      const run = cache2.findLatestRun('test.zip', 'different_hash')

      expect(run).toBeNull()
    })
  })

  describe('getOrCreateRun', () => {
    it('creates new run when none exists', () => {
      const run = cache.getOrCreateRun('test.zip', 'hash123')
      expect(run).not.toBeNull()
      expect(run.fileHash).toBe('hash123')
    })

    it('reuses existing run with matching hash', () => {
      const fileHash = 'abc123def456'
      const run1 = cache.initRun('test.zip', fileHash)

      const cache2 = new PipelineCache(tempDir)
      const run2 = cache2.getOrCreateRun('test.zip', fileHash)

      expect(run2.runDir).toBe(run1.runDir)
    })
  })

  describe('stage operations', () => {
    beforeEach(() => {
      cache.initRun('test.zip', 'hash123')
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

    it('restores Date objects in contextBefore/contextAfter', () => {
      const timestamp = new Date('2025-01-15T10:30:00Z')
      const data = [
        {
          messageId: 1,
          content: 'Test',
          timestamp,
          contextBefore: [{ id: 0, sender: 'Alice', content: 'Before', timestamp }],
          contextAfter: [{ id: 2, sender: 'Bob', content: 'After', timestamp }]
        }
      ]
      cache.setStage('candidates.heuristics', data)

      const retrieved = cache.getStage<typeof data>('candidates.heuristics')
      expect(retrieved).not.toBeNull()
      if (!retrieved) throw new Error('retrieved is null')

      // Check top-level timestamp is restored
      expect(retrieved[0]?.timestamp).toBeInstanceOf(Date)
      // Check contextBefore timestamps are restored
      expect(retrieved[0]?.contextBefore[0]?.timestamp).toBeInstanceOf(Date)
      expect(retrieved[0]?.contextBefore[0]?.timestamp.toISOString()).toBe(
        '2025-01-15T10:30:00.000Z'
      )
      // Check contextAfter timestamps are restored
      expect(retrieved[0]?.contextAfter[0]?.timestamp).toBeInstanceOf(Date)
      expect(retrieved[0]?.contextAfter[0]?.timestamp.toISOString()).toBe(
        '2025-01-15T10:30:00.000Z'
      )
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
      cache.initRun('test.zip', 'hash123')
      expect(cache.getRunDir()).toContain('test')
    })
  })

  describe('listRuns', () => {
    it('returns empty array when no runs exist', () => {
      const runs = cache.listRuns('test.zip')
      expect(runs).toEqual([])
    })

    it('lists all runs for an input file', () => {
      cache.initRun('test.zip', 'hash1')
      cache.initRun('test.zip', 'hash2')
      cache.initRun('test.zip', 'hash3')

      const cache2 = new PipelineCache(tempDir)
      const runs = cache2.listRuns('test.zip')

      expect(runs.length).toBe(3)
    })

    it('sorts runs by datetime descending', () => {
      cache.initRun('test.zip', 'hash1')
      cache.initRun('test.zip', 'hash2')

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
