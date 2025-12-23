/**
 * Parse Command E2E Tests
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FIXTURE_INPUT,
  findChatCacheDir,
  type ParseStats,
  readCacheJson,
  runCli,
  testState
} from './helpers'

export function parseCommandTests(): void {
  describe('parse command', () => {
    it('parses on first run, uses cache on second run', () => {
      // First run: fresh parse
      const run1 = runCli(`parse ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
      expect(run1.exitCode).toBe(0)
      expect(run1.stdout).toMatch(/\d+ messages/)
      expect(run1.stdout).toContain('Parsing messages...')
      expect(run1.stdout).not.toContain('cached')

      // Second run: should use cache
      const run2 = runCli(`parse ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
      expect(run2.exitCode).toBe(0)
      expect(run2.stdout).toContain('Parsing messages... 📦 cached')
    })

    it('writes parse_stats.json to cache', () => {
      const stats = readCacheJson<ParseStats>(testState.tempCacheDir, 'parse_stats.json')
      expect(stats.messageCount).toBeGreaterThanOrEqual(280)
      expect(stats.senderCount).toBeGreaterThanOrEqual(2)
      expect(stats.urlCount).toBeGreaterThanOrEqual(4)
      expect(stats.senders).toContain('Alice Smith')
      expect(stats.senders).toContain('John Smith')
    })

    it('writes messages.json to cache', () => {
      const chatDir = findChatCacheDir(testState.tempCacheDir)
      expect(chatDir).not.toBeNull()
      if (chatDir) {
        expect(existsSync(join(chatDir, 'messages.json'))).toBe(true)
      }
    })

    it('respects --quiet flag', () => {
      const { stdout } = runCli(
        `parse ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --quiet`
      )

      // Quiet mode should have minimal output
      expect(stdout.split('\n').filter((l) => l.trim()).length).toBeLessThan(5)
    })
  })
}
