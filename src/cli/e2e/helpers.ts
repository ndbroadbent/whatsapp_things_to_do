/**
 * E2E Test Helpers
 *
 * Shared utilities for CLI E2E tests.
 *
 * CRITICAL: When cache-fixture.tar.gz exists, ALL API keys are stripped
 * and real HTTP requests are forbidden.
 *
 * Environment variables:
 * - UPDATE_E2E_CACHE=true - Allow API calls for cache misses (adds to existing cache)
 * - REPLACE_E2E_CACHE=true - Delete existing cache and rebuild from scratch
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
export interface E2ETestState {
  tempCacheDir: string
  initialCacheHash: string
  /** Whether cache updates are allowed (UPDATE_E2E_CACHE=true) */
  allowCacheUpdates: boolean
  /** Whether cache fixture exists */
  hasFixture: boolean
}

/** Test state - initialized by globalSetup, accessed via inject() in tests */
export let testState: E2ETestState = {
  tempCacheDir: '',
  initialCacheHash: '',
  allowCacheUpdates: false,
  hasFixture: false
}

/** Called by tests to set state from inject() */
export function setTestState(state: E2ETestState): void {
  testState = state
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
 * - Set all API keys to fake values (so code paths that check for keys still run)
 * - Set E2E_CACHE_LOCKED=true to block uncached HTTP requests
 *
 * This ensures cached responses are used, while the HTTP guard catches any cache misses.
 */
function buildCliEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }

  // If fixture exists and we're NOT updating, lock down the environment
  if (testState.hasFixture && !testState.allowCacheUpdates) {
    // Set fake API keys so code paths still execute (cache will provide responses)
    for (const key of API_KEY_ENV_VARS) {
      env[key] = 'e2e-test-fake-key'
    }
    // Signal to HTTP layer to block uncached requests
    env.E2E_CACHE_LOCKED = 'true'
  }

  return env
}

/**
 * Run CLI command and return output.
 * Throws immediately if stderr has content (surfaces errors clearly).
 */
export function runCli(args: string): { stdout: string; stderr: string; exitCode: number } {
  const parsedArgs = parseArgs(args)
  const result = spawnSync('bun', ['src/cli.ts', ...parsedArgs], {
    encoding: 'utf-8',
    env: buildCliEnv()
  })

  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const exitCode = result.status ?? 1

  // Surface errors immediately - much easier to debug
  if (stderr) {
    throw new Error(`CLI stderr:\n${stderr}`)
  }
  if (exitCode !== 0) {
    throw new Error(`CLI exited with code ${exitCode}\nstdout:\n${stdout}`)
  }

  return { stdout, stderr, exitCode }
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

/**
 * Read classifier prompt files from the API cache.
 * Returns all prompt.txt file contents as an array.
 */
export function readClassifierPrompts(cacheDir: string): string[] {
  const promptDir = join(cacheDir, 'requests', 'ai', 'openrouter', 'google', 'gemini-2.5-flash')
  if (!existsSync(promptDir)) return []

  const files = readdirSync(promptDir).filter((f) => f.endsWith('.prompt.txt'))
  return files.map((f) => readFileSync(join(promptDir, f), 'utf-8'))
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
  contextBefore: string[]
  contextAfter: string[]
}

/**
 * Setup test environment - called by globalSetup
 * Returns state to be passed to tests via provide()
 */
export function setupE2ETests(): E2ETestState {
  const replaceCache = ['true', '1'].includes(process.env.REPLACE_E2E_CACHE ?? '')
  const allowCacheUpdates =
    ['true', '1'].includes(process.env.UPDATE_E2E_CACHE ?? '') || replaceCache

  // REPLACE_E2E_CACHE deletes existing fixture first
  if (replaceCache && existsSync(CACHE_FIXTURE)) {
    rmSync(CACHE_FIXTURE)
    console.log('🗑️  Deleted existing cache fixture (REPLACE_E2E_CACHE=true)')
  }

  const hasFixture = existsSync(CACHE_FIXTURE)
  const tempCacheDir = mkdtempSync(join(tmpdir(), 'chat-to-map-e2e-'))

  if (replaceCache) {
    console.log('🔄 E2E tests running in REPLACE mode (rebuilding cache from scratch)')
  } else if (allowCacheUpdates) {
    console.log('🔓 E2E tests running in UPDATE mode (API calls allowed for cache misses)')
  } else if (!hasFixture) {
    console.log('⚠️  No cache fixture found - API calls will be made')
  }

  extractCacheFixture(tempCacheDir)
  const initialCacheHash = hashDirectory(join(tempCacheDir, 'requests'))

  return { tempCacheDir, initialCacheHash, allowCacheUpdates, hasFixture }
}

/**
 * Teardown test environment - called by globalSetup teardown
 */
export function teardownE2ETests(state: E2ETestState): void {
  const finalCacheHash = hashDirectory(join(state.tempCacheDir, 'requests'))

  // Update fixture if:
  // 1. UPDATE_E2E_CACHE=true AND hash changed, OR
  // 2. No fixture exists (first run - always save)
  const shouldSave =
    (state.allowCacheUpdates && finalCacheHash !== state.initialCacheHash) ||
    (!state.hasFixture && finalCacheHash)

  if (shouldSave) {
    compressCacheFixture(state.tempCacheDir)
    console.log('📦 Cache fixture updated: tests/fixtures/cli/cache-fixture.tar.gz')
  } else if (
    state.hasFixture &&
    !state.allowCacheUpdates &&
    finalCacheHash !== state.initialCacheHash
  ) {
    // This should NOT happen in locked mode - it means HTTP guard failed
    console.error('❌ ERROR: Cache was modified in LOCKED mode!')
    console.error('   This indicates uncached HTTP requests were made.')
    console.error('   Check E2E_CACHE_LOCKED handling in src/http.ts')
  }

  rmSync(state.tempCacheDir, { recursive: true, force: true })
}
