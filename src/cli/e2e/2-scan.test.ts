/**
 * Scan Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import {
  type Candidate,
  FIXTURE_INPUT,
  readCacheJson,
  runCli,
  type ScanStats,
  testState
} from './helpers'

describe('scan command', () => {
  it('scans on first run, uses cache on second run', () => {
    // First run: fresh scan (parse may be cached, but scan itself is fresh)
    const run1 = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('🔍 Heuristic scan found')
    expect(run1.stdout).toContain('potential activities')
    // Scan step itself should NOT show cached on first run
    expect(run1.stdout).not.toMatch(/🔍 Heuristic scan found.*cached/)

    // Second run: should use cached heuristics
    const run2 = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toMatch(/🔍 Heuristic scan found.*📦 cached/)
  })

  it('writes scan_stats.json to cache', () => {
    const stats = readCacheJson<ScanStats>(testState.tempCacheDir, 'scan_stats.json')
    expect(stats.totalUnique).toBeGreaterThanOrEqual(7)
    expect(stats.regexMatches).toBeGreaterThanOrEqual(8)
    expect(stats.urlMatches).toBeGreaterThanOrEqual(1)
  })

  it('writes candidates.heuristics.json to cache', () => {
    const candidates = readCacheJson<Candidate[]>(
      testState.tempCacheDir,
      'candidates.heuristics.json'
    )
    expect(candidates.length).toBeGreaterThanOrEqual(7)

    // Check top candidates are present
    const contents = candidates.map((c) => c.content)
    expect(contents.some((c) => c.includes('Karangahake Gorge'))).toBe(true)
    expect(contents.some((c) => c.includes('Prinzhorn'))).toBe(true)
    expect(contents.some((c) => c.includes("I'm keen"))).toBe(true)
  })

  it('finds specific suggestions in output', () => {
    const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)

    expect(stdout).toContain('Karangahake Gorge')
    expect(stdout).toContain('Prinzhorn collection')
    expect(stdout).toContain('bay of islands')
    expect(stdout).toContain('whale and dolphin safari')
    expect(stdout).toContain('hot air ballon')
  })

  it('finds agreement candidates', () => {
    const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -n 20`)
    expect(stdout).toContain("I'm keen!")
  })

  it('deduplicates agreements near suggestions', () => {
    const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    // "That looks amazing!" should be deduplicated (response to whale safari)
    expect(stdout).not.toContain('That looks amazing!')
  })

  it('respects --max-results flag', () => {
    const { stdout } = runCli(`scan ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -n 3`)
    expect(stdout).toContain('Top 3 candidates')
  })
})
