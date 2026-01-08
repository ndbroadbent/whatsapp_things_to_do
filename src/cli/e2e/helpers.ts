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
  'GOOGLE_AI_API_KEY',
  'PIXABAY_API_KEY'
]

/** Shared test state */
export interface E2ETestState {
  tempCacheDir: string
  /** Path to temp config file (isolated from user's config) */
  tempConfigFile: string
  initialCacheHash: string
  initialCacheFiles: Set<string>
  /** Whether cache updates are allowed (UPDATE_E2E_CACHE=true) */
  allowCacheUpdates: boolean
  /** Whether cache fixture exists */
  hasFixture: boolean
}

/** Test state - initialized by globalSetup, accessed via inject() in tests */
export let testState: E2ETestState = {
  tempCacheDir: '',
  tempConfigFile: '',
  initialCacheHash: '',
  initialCacheFiles: new Set(),
  allowCacheUpdates: false,
  hasFixture: false
}

/** Called by tests to set state from inject() */
export function setTestState(state: E2ETestState): void {
  testState = state
}

/**
 * Collect all files in a directory recursively.
 */
function collectFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return []

  const files: string[] = []

  function walk(currentDir: string): void {
    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else {
        files.push(fullPath)
      }
    }
  }

  walk(dir)
  return files.sort()
}

/**
 * Calculate SHA256 hash of all files in a directory (recursively)
 */
function hashDirectory(dir: string): string {
  const files = collectFilesRecursive(dir)
  if (files.length === 0) return ''

  const hash = createHash('sha256')
  for (const file of files) {
    const content = readFileSync(file, 'utf-8')
    hash.update(file.replace(dir, ''))
    hash.update(content)
  }

  return hash.digest('hex')
}

/**
 * List files in cache directories (relative paths).
 */
function listCacheFiles(cacheDir: string): Set<string> {
  const files = new Set<string>()
  for (const subdir of ['requests', 'images']) {
    const dir = join(cacheDir, subdir)
    for (const file of collectFilesRecursive(dir)) {
      files.add(file.replace(`${cacheDir}/`, ''))
    }
  }
  return files
}

/**
 * Extract cache fixture to temp directory
 */
function extractCacheFixture(targetDir: string): void {
  if (!existsSync(CACHE_FIXTURE)) return
  execSync(`tar -xzf ${CACHE_FIXTURE} -C ${targetDir}`, { encoding: 'utf-8' })
}

/**
 * Compress cache directory to fixture.
 * Includes both requests/ (API responses) and images/ (thumbnails).
 */
function compressCacheFixture(sourceDir: string): void {
  const requestsDir = join(sourceDir, 'requests')
  const imagesDir = join(sourceDir, 'images')

  // Build list of directories to include
  const dirs: string[] = []
  if (existsSync(requestsDir)) dirs.push('requests')
  if (existsSync(imagesDir)) dirs.push('images')

  if (dirs.length === 0) return

  execSync(`tar -czf ${CACHE_FIXTURE} -C ${sourceDir} ${dirs.join(' ')}`, {
    encoding: 'utf-8'
  })
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

  // Use isolated config file for tests (prevents reading/writing user's config)
  if (testState.tempConfigFile) {
    env.CHAT_TO_MAP_CONFIG = testState.tempConfigFile
  }

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
export function runCli(args: string): {
  stdout: string
  stderr: string
  exitCode: number
} {
  const parsedArgs = parseArgs(args)
  const debug = !!process.env.DEBUG_E2E

  if (debug) {
    console.log(`\n🔧 [DEBUG] Running CLI: bun src/cli.ts ${parsedArgs.join(' ')}`)
    console.log(`🔧 [DEBUG] Cache dir: ${testState.tempCacheDir}`)
  }

  const startTime = Date.now()
  const result = spawnSync('bun', ['src/cli.ts', ...parsedArgs], {
    encoding: 'utf-8',
    env: buildCliEnv(),
    timeout: 120000 // 2 minute timeout per command
  })
  const elapsed = Date.now() - startTime

  if (debug) {
    console.log(`🔧 [DEBUG] CLI completed in ${elapsed}ms, exit code: ${result.status}`)
    if (result.signal) {
      console.log(`🔧 [DEBUG] CLI was killed with signal: ${result.signal}`)
    }
  }

  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const exitCode = result.status ?? 1

  // Check if killed by timeout or signal
  if (result.signal) {
    throw new Error(
      `CLI was killed with signal ${result.signal} after ${elapsed}ms\nstdout:\n${stdout}\nstderr:\n${stderr}`
    )
  }

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
 * Searches all provider/model directories for prompt files.
 */
export function readClassifierPrompts(cacheDir: string): string[] {
  const aiDir = join(cacheDir, 'requests', 'ai')
  if (!existsSync(aiDir)) return []

  const prompts: string[] = []

  // Search all provider directories recursively for .prompt.txt files
  const searchDir = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        searchDir(fullPath)
      } else if (entry.name.endsWith('.prompt.txt')) {
        prompts.push(readFileSync(fullPath, 'utf-8'))
      }
    }
  }

  searchDir(aiDir)
  return prompts
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
  // Create temp config file to isolate tests from user's config
  const tempConfigFile = join(tempCacheDir, 'config.json')

  if (replaceCache) {
    console.log('🔄 E2E tests running in REPLACE mode (rebuilding cache from scratch)')
  } else if (allowCacheUpdates) {
    console.log('🔓 E2E tests running in UPDATE mode (API calls allowed for cache misses)')
  } else if (!hasFixture) {
    console.log('⚠️  No cache fixture found - API calls will be made')
  }

  if (process.env.DEBUG_E2E) {
    console.log(`🔍 E2E temp cache dir: ${tempCacheDir}`)
    console.log(`🔍 E2E temp config file: ${tempConfigFile}`)
  }

  extractCacheFixture(tempCacheDir)
  const initialCacheHash = hashCacheDirectories(tempCacheDir)
  const initialCacheFiles = listCacheFiles(tempCacheDir)

  return {
    tempCacheDir,
    tempConfigFile,
    initialCacheHash,
    initialCacheFiles,
    allowCacheUpdates,
    hasFixture
  }
}

/**
 * Hash both requests/ and images/ directories for cache change detection.
 */
function hashCacheDirectories(cacheDir: string): string {
  const requestsHash = hashDirectory(join(cacheDir, 'requests'))
  const imagesHash = hashDirectory(join(cacheDir, 'images'))
  return `${requestsHash}:${imagesHash}`
}

/**
 * Teardown test environment - called by globalSetup teardown
 */
export function teardownE2ETests(state: E2ETestState): void {
  const finalCacheHash = hashCacheDirectories(state.tempCacheDir)

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
    const finalCacheFiles = listCacheFiles(state.tempCacheDir)
    const added = [...finalCacheFiles].filter((f) => !state.initialCacheFiles.has(f))
    const removed = [...state.initialCacheFiles].filter((f) => !finalCacheFiles.has(f))

    console.error('')
    console.error('❌ ERROR: Cache was modified in LOCKED mode!')
    console.error('   This indicates uncached HTTP requests were made.')
    console.error('')
    if (added.length > 0) {
      console.error('   Files added:')
      for (const f of added.slice(0, 20)) {
        console.error(`     + ${f}`)
      }
      if (added.length > 20) {
        console.error(`     ... and ${added.length - 20} more`)
      }
    }
    if (removed.length > 0) {
      console.error('   Files removed:')
      for (const f of removed.slice(0, 20)) {
        console.error(`     - ${f}`)
      }
      if (removed.length > 20) {
        console.error(`     ... and ${removed.length - 20} more`)
      }
    }
    console.error('')
    console.error('   To update the cache fixture, run:')
    console.error('     UPDATE_E2E_CACHE=true bun run test:e2e')
    console.error('')
  }

  if (process.env.DEBUG_E2E) {
    console.log(`🔍 Preserving temp cache dir for debugging: ${state.tempCacheDir}`)
  } else {
    rmSync(state.tempCacheDir, { recursive: true, force: true })
  }
}
