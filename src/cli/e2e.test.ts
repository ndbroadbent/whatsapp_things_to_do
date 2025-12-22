/**
 * E2E CLI Tests
 *
 * These tests spawn the actual CLI process and verify output.
 * Uses tests/fixtures/cli/ for test inputs and cached API responses.
 *
 * Test Flow:
 * 1. Setup: Create temp dir, extract cache-fixture.tar.gz if exists
 * 2. Run: Spawn CLI with --cache-dir <tempdir>, verify output
 * 3. Teardown: If cache changed, recompress to cache-fixture.tar.gz
 *
 * To update fixtures: Run tests locally with API keys set.
 * New API responses will be cached and fixtures auto-updated.
 */

import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const FIXTURES_DIR = 'tests/fixtures/cli'
const FIXTURE_INPUT = join(FIXTURES_DIR, 'whatsapp-sample.txt')
const CACHE_FIXTURE = join(FIXTURES_DIR, 'cache-fixture.tar.gz')

let tempCacheDir: string
let initialCacheHash: string

/**
 * Calculate SHA256 hash of all files in a directory (recursively)
 */
function hashDirectory(dir: string): string {
  if (!existsSync(dir)) return ''

  const hash = createHash('sha256')
  const files: string[] = []

  function collectFiles(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        collectFiles(fullPath)
      } else {
        files.push(fullPath)
      }
    }
  }

  collectFiles(dir)
  files.sort()

  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    hash.update(file.replace(dir, ''))
    hash.update(content)
  }

  return hash.digest('hex')
}

/**
 * Extract cache fixture to temp directory
 */
function extractCacheFixture(targetDir: string): void {
  if (!existsSync(CACHE_FIXTURE)) return

  execSync(`tar -xzf ${CACHE_FIXTURE} -C ${targetDir}`, { encoding: 'utf-8' })
}

/**
 * Compress cache directory to fixture
 */
function compressCacheFixture(sourceDir: string): void {
  const requestsDir = join(sourceDir, 'requests')
  if (!existsSync(requestsDir)) return

  execSync(`tar -czf ${CACHE_FIXTURE} -C ${sourceDir} requests`, { encoding: 'utf-8' })
}

/**
 * Run CLI command and return output
 */
function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync('bun', ['src/cli.ts', ...args.split(' ')], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' }
  })

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? 1
  }
}

/**
 * Find the chat cache directory (contains timestamp in name)
 */
function findChatCacheDir(cacheDir: string): string | null {
  const chatsDir = join(cacheDir, 'chats', 'whatsapp-sample')
  if (!existsSync(chatsDir)) return null

  const entries = readdirSync(chatsDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  if (dirs.length === 0) return null

  // Return most recent (sorted by timestamp in name)
  dirs.sort().reverse()
  const first = dirs[0]
  if (!first) return null
  return join(chatsDir, first)
}

/**
 * Read and parse a JSON file from cache, throws if not found
 */
function readCacheJson<T>(cacheDir: string, filename: string): T {
  const chatDir = findChatCacheDir(cacheDir)
  if (!chatDir) throw new Error(`Chat cache dir not found in ${cacheDir}`)

  const filePath = join(chatDir, filename)
  if (!existsSync(filePath)) throw new Error(`Cache file not found: ${filePath}`)

  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

interface ParseStats {
  messageCount: number
  senderCount: number
  urlCount: number
  dateRange: { start: string; end: string }
  senders: string[]
}

interface ScanStats {
  totalUnique: number
  regexMatches: number
  urlMatches: number
}

interface Candidate {
  messageId: number
  content: string
  sender: string
  confidence: number
  candidateType: string
}

beforeAll(() => {
  // Create temp directory for cache
  tempCacheDir = mkdtempSync(join(tmpdir(), 'chat-to-map-e2e-'))

  // Extract existing cache fixture if present
  extractCacheFixture(tempCacheDir)

  // Calculate initial hash
  initialCacheHash = hashDirectory(join(tempCacheDir, 'requests'))
})

afterAll(() => {
  // Check if cache changed
  const finalCacheHash = hashDirectory(join(tempCacheDir, 'requests'))

  if (finalCacheHash !== initialCacheHash && finalCacheHash !== '') {
    // Cache was updated - save new fixture
    compressCacheFixture(tempCacheDir)
    console.log('📦 Cache fixture updated: tests/fixtures/cli/cache-fixture.tar.gz')
  }

  // Clean up temp directory
  rmSync(tempCacheDir, { recursive: true, force: true })
})

describe('CLI E2E', () => {
  describe('parse command', () => {
    it('parses the fixture and shows message count', () => {
      const { stdout, exitCode } = runCli(`parse ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      expect(exitCode).toBe(0)
      expect(stdout).toMatch(/\d+ messages/)
    })

    it('writes parse_stats.json to cache', () => {
      runCli(`parse ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      const stats = readCacheJson<ParseStats>(tempCacheDir, 'parse_stats.json')
      expect(stats.messageCount).toBeGreaterThanOrEqual(280)
      expect(stats.senderCount).toBeGreaterThanOrEqual(2)
      expect(stats.urlCount).toBeGreaterThanOrEqual(4)
      expect(stats.senders).toContain('Alice Smith')
      expect(stats.senders).toContain('John Smith')
    })

    it('writes messages.json to cache', () => {
      runCli(`parse ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      const chatDir = findChatCacheDir(tempCacheDir)
      expect(chatDir).not.toBeNull()
      if (chatDir) {
        expect(existsSync(join(chatDir, 'messages.json'))).toBe(true)
      }
    })

    it('respects --quiet flag', () => {
      const { stdout } = runCli(`parse ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} --quiet`)

      // Quiet mode should have minimal output
      expect(stdout.split('\n').filter((l) => l.trim()).length).toBeLessThan(5)
    })
  })

  describe('scan command', () => {
    it('finds candidates from heuristics', () => {
      const { stdout, exitCode } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      expect(exitCode).toBe(0)
      expect(stdout).toContain('Heuristic scan found')
      expect(stdout).toContain('potential activities')
    })

    it('writes scan_stats.json to cache', () => {
      runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      const stats = readCacheJson<ScanStats>(tempCacheDir, 'scan_stats.json')
      expect(stats.totalUnique).toBeGreaterThanOrEqual(7)
      expect(stats.regexMatches).toBeGreaterThanOrEqual(8)
      expect(stats.urlMatches).toBeGreaterThanOrEqual(1)
    })

    it('writes candidates.heuristics.json to cache', () => {
      runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      const candidates = readCacheJson<Candidate[]>(tempCacheDir, 'candidates.heuristics.json')
      expect(candidates.length).toBeGreaterThanOrEqual(7)

      // Check top candidates are present
      const contents = candidates.map((c) => c.content)
      expect(contents.some((c) => c.includes('Karangahake Gorge'))).toBe(true)
      expect(contents.some((c) => c.includes('Prinzhorn'))).toBe(true)
      expect(contents.some((c) => c.includes("I'm keen"))).toBe(true)
    })

    it('finds specific suggestions in output', () => {
      const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      expect(stdout).toContain('Karangahake Gorge')
      expect(stdout).toContain('Prinzhorn collection')
      expect(stdout).toContain('bay of islands')
      expect(stdout).toContain('whale and dolphin safari')
      expect(stdout).toContain('hot air ballon')
    })

    it('finds agreement candidates', () => {
      const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      expect(stdout).toContain("I'm keen!")
    })

    it('deduplicates agreements near suggestions', () => {
      const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir}`)

      // "That looks amazing!" should be deduplicated (response to whale safari)
      expect(stdout).not.toContain('That looks amazing!')
    })

    it('respects --max-results flag', () => {
      const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -n 3`)

      expect(stdout).toContain('Top 3 candidates')
    })
  })

  describe('preview command', () => {
    it('classifies candidates with AI', () => {
      const { stdout, exitCode } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -c "New Zealand"`
      )

      expect(exitCode).toBe(0)
      expect(stdout).toContain('AI classification')
    })

    it('writes preview_stats.json to cache', () => {
      runCli(`preview ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -c "New Zealand"`)

      const stats = readCacheJson<{ classifiedCount: number }>(tempCacheDir, 'preview_stats.json')
      expect(stats.classifiedCount).toBeGreaterThanOrEqual(1)
    })

    it('writes candidates.classified.json to cache', () => {
      runCli(`preview ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -c "New Zealand"`)

      const candidates = readCacheJson<Candidate[]>(tempCacheDir, 'candidates.classified.json')
      expect(candidates.length).toBeGreaterThanOrEqual(1)

      // Check classifications have required fields
      const first = candidates[0]
      expect(first).toHaveProperty('content')
      expect(first).toHaveProperty('candidateType')
    })

    it('shows classified activities in output', () => {
      const { stdout } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -c "New Zealand"`
      )

      // Should show some activity names from classification
      expect(stdout).toMatch(/activity|hike|restaurant|trip/i)
    })

    it('respects --max-results flag', () => {
      const { stdout } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -c "New Zealand" -n 3`
      )

      expect(stdout).toMatch(/3|three/i)
    })

    it('respects --dry-run flag', () => {
      const { stdout, exitCode } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${tempCacheDir} -c "New Zealand" --dry-run`
      )

      expect(exitCode).toBe(0)
      expect(stdout).toContain('dry run')
    })
  })
})
