/**
 * E2E Test Helpers
 *
 * Shared utilities for CLI E2E tests.
 */

import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FIXTURES_DIR = 'tests/fixtures/cli'
export const FIXTURE_INPUT = join(FIXTURES_DIR, 'whatsapp-sample.txt')
const CACHE_FIXTURE = join(FIXTURES_DIR, 'cache-fixture.tar.gz')

/** Shared test state */
interface E2ETestState {
  tempCacheDir: string
  initialCacheHash: string
}

export const testState: E2ETestState = {
  tempCacheDir: '',
  initialCacheHash: ''
}

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
 * Parse CLI arguments, handling quoted strings properly.
 */
function parseArgs(args: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''

  for (const char of args) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true
      quoteChar = char
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false
      quoteChar = ''
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        result.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }

  if (current) {
    result.push(current)
  }

  return result
}

/**
 * Run CLI command and return output
 */
export function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  const parsedArgs = parseArgs(args)
  const result = spawnSync('bun', ['src/cli.ts', ...parsedArgs], {
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
export function findChatCacheDir(cacheDir: string): string | null {
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
export function readCacheJson<T>(cacheDir: string, filename: string): T {
  const chatDir = findChatCacheDir(cacheDir)
  if (!chatDir) throw new Error(`Chat cache dir not found in ${cacheDir}`)

  const filePath = join(chatDir, filename)
  if (!existsSync(filePath)) throw new Error(`Cache file not found: ${filePath}`)

  return JSON.parse(readFileSync(filePath, 'utf-8'))
}

/** Shared type definitions */
export interface ParseStats {
  messageCount: number
  senderCount: number
  urlCount: number
  dateRange: { start: string; end: string }
  senders: string[]
}

export interface ScanStats {
  totalUnique: number
  regexMatches: number
  urlMatches: number
}

export interface Candidate {
  messageId: number
  content: string
  sender: string
  confidence: number
  candidateType: string
}

/**
 * Setup test environment - call in beforeAll
 */
export function setupE2ETests(): void {
  testState.tempCacheDir = mkdtempSync(join(tmpdir(), 'chat-to-map-e2e-'))
  extractCacheFixture(testState.tempCacheDir)
  testState.initialCacheHash = hashDirectory(join(testState.tempCacheDir, 'requests'))
}

/**
 * Teardown test environment - call in afterAll
 */
export function teardownE2ETests(): void {
  const finalCacheHash = hashDirectory(join(testState.tempCacheDir, 'requests'))

  if (finalCacheHash !== testState.initialCacheHash && finalCacheHash !== '') {
    compressCacheFixture(testState.tempCacheDir)
    console.log('📦 Cache fixture updated: tests/fixtures/cli/cache-fixture.tar.gz')
  }

  rmSync(testState.tempCacheDir, { recursive: true, force: true })
}
