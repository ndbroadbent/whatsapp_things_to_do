/**
 * E2E Test Helpers
 *
 * Shared utilities for CLI E2E tests.
 *
 * CRITICAL: When cache-fixture.tar.gz exists, ALL API keys are stripped
 * and real HTTP requests are forbidden. Set UPDATE_E2E_CACHE=true to
 * allow updating the cache with new API responses.
 */

import { execSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const FIXTURES_DIR = 'tests/fixtures/cli'
export const FIXTURE_INPUT = join(FIXTURES_DIR, 'whatsapp-sample.txt')
const CACHE_FIXTURE = join(FIXTURES_DIR, 'cache-fixture.tar.gz')

/** API key environment variables to strip during locked tests */
const API_KEY_ENV_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_API_KEY'
]

/** Shared test state */
interface E2ETestState {
  tempCacheDir: string
  initialCacheHash: string
  /** Whether cache updates are allowed (UPDATE_E2E_CACHE=true) */
  allowCacheUpdates: boolean
  /** Whether cache fixture exists */
  hasFixture: boolean
}

export const testState: E2ETestState = {
  tempCacheDir: '',
  initialCacheHash: '',
  allowCacheUpdates: false,
  hasFixture: false
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
 * Build environment for CLI subprocess.
 *
 * When cache fixture exists and UPDATE_E2E_CACHE is not set:
 * - Strip all API keys
 * - Set E2E_CACHE_LOCKED=true to block HTTP requests
 */
function buildCliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }

  // If fixture exists and we're NOT updating, lock down the environment
  if (testState.hasFixture && !testState.allowCacheUpdates) {
    // Strip all API keys
    for (const key of API_KEY_ENV_VARS) {
      delete env[key]
    }
    // Signal to HTTP layer to block uncached requests
    env.E2E_CACHE_LOCKED = 'true'
  }

  return env
}

/**
 * Run CLI command and return output
 */
export function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  const parsedArgs = parseArgs(args)
  const result = spawnSync('bun', ['src/cli.ts', ...parsedArgs], {
    encoding: 'utf-8',
    env: buildCliEnv()
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
  testState.hasFixture = existsSync(CACHE_FIXTURE)
  testState.allowCacheUpdates = process.env.UPDATE_E2E_CACHE === 'true'
  testState.tempCacheDir = mkdtempSync(join(tmpdir(), 'chat-to-map-e2e-'))

  if (testState.allowCacheUpdates) {
    console.log('🔓 E2E tests running in UPDATE mode (API calls allowed)')
  } else if (!testState.hasFixture) {
    console.log('⚠️  No cache fixture found - API calls will be made')
  }

  extractCacheFixture(testState.tempCacheDir)
  testState.initialCacheHash = hashDirectory(join(testState.tempCacheDir, 'requests'))
}

/**
 * Teardown test environment - call in afterAll
 */
export function teardownE2ETests(): void {
  const finalCacheHash = hashDirectory(join(testState.tempCacheDir, 'requests'))

  // Only update fixture if allowed AND hash changed
  if (testState.allowCacheUpdates && finalCacheHash !== testState.initialCacheHash) {
    compressCacheFixture(testState.tempCacheDir)
    console.log('📦 Cache fixture updated: tests/fixtures/cli/cache-fixture.tar.gz')
  } else if (!testState.allowCacheUpdates && finalCacheHash !== testState.initialCacheHash) {
    // This should NOT happen in locked mode - it means HTTP guard failed
    console.error('❌ ERROR: Cache was modified in LOCKED mode!')
    console.error('   This indicates uncached HTTP requests were made.')
    console.error('   Check E2E_CACHE_LOCKED handling in src/http.ts')
  }

  rmSync(testState.tempCacheDir, { recursive: true, force: true })
}
