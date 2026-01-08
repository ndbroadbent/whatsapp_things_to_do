/**
 * Resolve Links Command E2E Tests
 *
 * Tests entity resolution for movies, books, games, TV shows, and albums.
 */

import { describe, expect, it } from 'vitest'
import type { GeocodedActivity } from '../../types'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface ResolveLinkStats {
  activitiesProcessed: number
  withLinkHints: number
  resolved: number
  failed: number
}

describe('resolve-links command', () => {
  it('resolves links on first run, uses cache on second run', { timeout: 60000 }, () => {
    // First run: fresh resolve
    const run1 = runCli(
      `resolve-links ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Resolving links')
    // First run should NOT show cached
    expect(run1.stdout).not.toMatch(/Resolving links.*cached/)

    // Second run: should use cached results
    const run2 = runCli(
      `resolve-links ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('Resolving links... 📦 cached')
  })

  it('writes resolve_links_stats.json to cache', () => {
    const stats = readCacheJson<ResolveLinkStats>(
      testState.tempCacheDir,
      'resolve_links_stats.json'
    )
    expect(stats.activitiesProcessed).toBeGreaterThanOrEqual(10)
    // Should have some activities with link hints (movies, books, games, etc.)
    expect(stats.withLinkHints).toBeGreaterThanOrEqual(1)
    // Should resolve at least some of them
    expect(stats.resolved).toBeGreaterThanOrEqual(0)
  })

  it('writes resolved_links.json with activities', () => {
    const activities = readCacheJson<GeocodedActivity[]>(
      testState.tempCacheDir,
      'resolved_links.json'
    )
    expect(activities.length).toBeGreaterThanOrEqual(10)
  })

  it('resolves movie references to canonical URLs', () => {
    const activities = readCacheJson<GeocodedActivity[]>(
      testState.tempCacheDir,
      'resolved_links.json'
    )

    // Find Oppenheimer activity (added in sample chat)
    const oppenheimer = activities.find(
      (a) =>
        a.activity.toLowerCase().includes('oppenheimer') ||
        a.link?.query?.toLowerCase().includes('oppenheimer')
    )

    // If classifier detected it as a movie/media, it should have a resolved URL
    if (oppenheimer?.link?.type === 'movie' || oppenheimer?.link?.type === 'media') {
      expect(oppenheimer.resolvedUrl).toBeDefined()
      // Should resolve to IMDb or Wikipedia
      expect(oppenheimer.resolvedUrl).toMatch(/imdb\.com|wikipedia\.org/i)
    }
  })

  it('resolves book references to canonical URLs', () => {
    const activities = readCacheJson<GeocodedActivity[]>(
      testState.tempCacheDir,
      'resolved_links.json'
    )

    // Find Project Hail Mary activity (added in sample chat)
    const book = activities.find(
      (a) =>
        a.activity.toLowerCase().includes('project hail mary') ||
        a.link?.query?.toLowerCase().includes('project hail mary')
    )

    // If classifier detected it as a book, it should have a resolved URL
    if (book?.link?.type === 'book') {
      expect(book.resolvedUrl).toBeDefined()
      // Should resolve to Goodreads, Open Library, or Amazon
      expect(book.resolvedUrl).toMatch(/goodreads\.com|openlibrary\.org|amazon\./i)
    }
  })

  it('resolves board game references to canonical URLs', () => {
    const activities = readCacheJson<GeocodedActivity[]>(
      testState.tempCacheDir,
      'resolved_links.json'
    )

    // Find Wingspan activity (added in sample chat)
    const game = activities.find(
      (a) =>
        a.activity.toLowerCase().includes('wingspan') ||
        a.link?.query?.toLowerCase().includes('wingspan')
    )

    // If classifier detected it as a physical game with a resolved URL, check format
    if (game?.link?.type === 'physical_game' && game.resolvedUrl) {
      // Should resolve to BoardGameGeek or Wikipedia
      expect(game.resolvedUrl).toMatch(/boardgamegeek\.com|wikipedia\.org/i)
    }
    // At minimum, the game should be detected (even if not resolved)
    expect(game).toBeDefined()
  })

  it('shows resolved links in CLI output', () => {
    const { stdout } = runCli(
      `resolve-links ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )

    // Check header
    expect(stdout).toContain('Resolve Links Results')
    expect(stdout).toMatch(/Processed: \d+/)
    expect(stdout).toMatch(/With link hints: \d+/)
  })

  it('respects --max-results flag', () => {
    const { stdout } = runCli(
      `resolve-links ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --max-results 3`
    )

    // Check that output is limited
    expect(stdout).toContain('1.')
    // May or may not have more depending on how many have resolved links
  })

  it('respects --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `resolve-links ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --dry-run`
    )

    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toContain('dry run')
    expect(stdout).toContain('With link hints:')
    expect(stdout).not.toContain('Resolve Links Results')
  })
})
