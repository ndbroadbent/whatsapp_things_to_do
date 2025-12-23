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

import { afterAll, beforeAll, describe } from 'vitest'
import { setupE2ETests, teardownE2ETests } from './helpers'
import { parseCommandTests } from './parse.test'
import { previewCommandTests } from './preview.test'
import { scanCommandTests } from './scan.test'

beforeAll(() => {
  setupE2ETests()
})

afterAll(() => {
  teardownE2ETests()
})

// E2E tests must run sequentially - they share cache state
describe.sequential('CLI E2E', () => {
  parseCommandTests()
  scanCommandTests()
  previewCommandTests()
})
