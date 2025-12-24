/**
 * Filter Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import { type Candidate, FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface FilterStats {
  totalCandidates: number
  heuristicsMatches: number
  embeddingsMatches: number
}

describe('filter command', () => {
  it('filters on first run, uses cache on second run', () => {
    // First run: fresh filter
    const run1 = runCli(`filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run1.stdout).toContain('Extraction Results')
    expect(run1.stdout).toContain('Total candidates:')

    // Second run: should use cache for both embed and extract
    const run2 = runCli(`filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run2.stdout).toContain('Embedding messages... 📦 cached')
    expect(run2.stdout).toContain('Extracting candidates (embeddings)... 📦 cached')
  })

  it('shows extraction stats', () => {
    const { stdout } = runCli(`filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Extraction Results (method: both)')
    expect(stdout).toContain('Total candidates:')
    expect(stdout).toContain('Heuristics:')
    expect(stdout).toContain('Embeddings:')
  })

  it('writes filter_stats.json to cache', () => {
    const stats = readCacheJson<FilterStats>(testState.tempCacheDir, 'filter_stats.json')
    expect(stats.totalCandidates).toBeGreaterThanOrEqual(24)
    expect(stats.heuristicsMatches).toBeGreaterThanOrEqual(10)
    expect(stats.embeddingsMatches).toBeGreaterThanOrEqual(31)
  })

  it('writes candidates.embeddings.json to cache', () => {
    const candidates = readCacheJson<Candidate[]>(
      testState.tempCacheDir,
      'candidates.embeddings.json'
    )
    expect(candidates.length).toBeGreaterThanOrEqual(31)
  })

  it('shows first 10 candidates by default', () => {
    const { stdout } = runCli(`filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('First 10 Candidates')
    // More candidates exist beyond the first 10
    expect(stdout).toMatch(/\.\.\. and \d+ more \(use --all to show all\)/)
  })

  it('shows all candidates with --all flag', () => {
    const { stdout } = runCli(`filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --all`)
    // Shows all candidates (count may vary as fixture grows)
    expect(stdout).toMatch(/All \d+ Candidates/)
    expect(stdout).not.toContain('... and')
  })

  it('finds specific suggestions in output', () => {
    const { stdout } = runCli(`filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Karangahake Gorge')
    expect(stdout).toContain('Prinzhorn collection')
    expect(stdout).toContain('bay of islands')
  })

  it('deduplicates agreements near suggestions', () => {
    const candidates = readCacheJson<Candidate[]>(testState.tempCacheDir, 'candidates.all.json')

    // "Paintball. Saturday?" should be kept (suggestion from embeddings)
    const paintball = candidates.find((c) => c.content.includes('Paintball'))
    expect(paintball).toBeDefined()

    // "I'm keen!" should be removed (agreement near paintball suggestion)
    const keen = candidates.find((c) => c.content.includes("I'm keen!"))
    expect(keen).toBeUndefined()
  })

  it('supports --method heuristics flag', () => {
    const { stdout, exitCode } = runCli(
      `filter ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --method heuristics`
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Extraction Results (method: heuristics)')
    expect(stdout).not.toContain('Embeddings:')
  })

  it('supports --dry-run flag', () => {
    const { stdout, exitCode } = runCli(`filter ${FIXTURE_INPUT} --dry-run --method embeddings`)
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Embedding Cost Estimate')
    expect(stdout).not.toContain('Extraction Results')
  })

  it('all candidates have context (regression test)', () => {
    const candidates = readCacheJson<Candidate[]>(testState.tempCacheDir, 'candidates.all.json')

    // Every candidate must have contextBefore and contextAfter arrays
    for (const candidate of candidates) {
      expect(candidate.contextBefore).toBeDefined()
      expect(candidate.contextAfter).toBeDefined()
      expect(Array.isArray(candidate.contextBefore)).toBe(true)
      expect(Array.isArray(candidate.contextAfter)).toBe(true)

      // At least one should have content (unless at very start/end of chat)
      const hasContext = candidate.contextBefore.length > 0 || candidate.contextAfter.length > 0
      expect(hasContext).toBe(true)
    }
  })
})
