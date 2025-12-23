/**
 * Scrape Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface ScrapeStats {
  urlCount: number
  successCount: number
  failedCount: number
  cachedCount: number
}

describe('scrape command', () => {
  it('scrapes on first run, uses cache on second run', () => {
    // First run: fresh scrape
    const run1 = runCli(`scrape ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Scraping')
    expect(run1.stdout).toContain('URLs')

    // Second run: should use cache
    const run2 = runCli(`scrape ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('Scraping URLs... 📦 cached')
  })

  it('shows scrape stats', () => {
    const { stdout } = runCli(`scrape ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Scrape Results')
    expect(stdout).toContain('Total URLs:')
    expect(stdout).toContain('Successful:')
    expect(stdout).toContain('Failed:')
  })

  it('writes scrape_stats.json to cache', () => {
    const stats = readCacheJson<ScrapeStats>(testState.tempCacheDir, 'scrape_stats.json')
    expect(stats.urlCount).toBeGreaterThanOrEqual(4)
    // cachedCount depends on API cache from fixture
    expect(stats.cachedCount).toBeGreaterThanOrEqual(0)
  })

  it('shows enriched URLs in output', () => {
    const { stdout } = runCli(`scrape ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Enriched URLs')
    // Should find at least one enriched URL with metadata
    expect(stdout).toContain('Platform:')
  })

  it('supports --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `scrape ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --dry-run`
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('dry run')
    expect(stdout).not.toContain('Scrape Results')
  })
})
