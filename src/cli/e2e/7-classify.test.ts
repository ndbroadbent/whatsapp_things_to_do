/**
 * Classify Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import type { ClassifiedActivity } from '../../types'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface ClassifyStats {
  candidatesClassified: number
  activitiesFound: number
  model: string
  provider: string
  batchCount: number
  cachedBatches: number
}

describe('classify command', () => {
  it('classifies on first run, uses cache on second run', () => {
    // First run: fresh classification
    const run1 = runCli(`classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Classifying')
    expect(run1.stdout).toContain('candidates')

    // Second run: should use cache
    const run2 = runCli(`classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('📦 cached')
  })

  it('shows classification results', () => {
    const { stdout } = runCli(`classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Classification Results')
    expect(stdout).toContain('Candidates:')
    expect(stdout).toContain('Activities:')
    expect(stdout).toContain('Model:')
  })

  it('writes classify_stats.json to cache', () => {
    const stats = readCacheJson<ClassifyStats>(testState.tempCacheDir, 'classify_stats.json')
    expect(stats.candidatesClassified).toBeGreaterThanOrEqual(10)
    expect(stats.activitiesFound).toBeGreaterThanOrEqual(8)
    expect(stats.model).toBeTruthy()
    expect(stats.provider).toBeTruthy()
  })

  it('writes classifications.json to cache', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )
    expect(activities.length).toBeGreaterThanOrEqual(8)

    // Check first activity has expected fields
    const first = activities[0]
    expect(first).toBeDefined()
    expect(first?.activity).toBeTruthy()
    expect(first?.category).toBeTruthy()
    expect(first?.sender).toBeTruthy()
    expect(first?.interestingScore).toBeGreaterThanOrEqual(0)
    expect(first?.funScore).toBeGreaterThanOrEqual(0)
  })

  it('sorts activities by score (interesting prioritized over fun)', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Verify sorting: each activity should have score >= next activity
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i]
      const next = activities[i + 1]
      if (!current || !next) continue

      const scoreA = current.interestingScore * 2 + current.funScore
      const scoreB = next.interestingScore * 2 + next.funScore
      expect(scoreA).toBeGreaterThanOrEqual(scoreB)
    }
  })

  it('displays activities with scores', () => {
    const { stdout } = runCli(`classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Activities:')
    // Should show scores
    expect(stdout).toContain('interesting:')
    expect(stdout).toContain('fun:')
  })

  it('supports --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --dry-run`
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('dry run')
    expect(stdout).not.toContain('Classification Results')
  })

  it('supports --max-results flag', () => {
    const { stdout } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --max-results 3`
    )
    // Should only show 3 activities in output
    const activityLines = stdout.split('\n').filter((l) => /^\d+\./.test(l))
    expect(activityLines.length).toBe(3)
  })

  it('supports --all flag to show all activities', () => {
    const { stdout } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --all`
    )
    // Should not have "and X more" message
    expect(stdout).not.toContain('more (use --all')
  })
})
