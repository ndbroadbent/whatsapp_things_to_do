/**
 * Preview Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface PreviewStats {
  candidatesClassified: number
  activitiesFound: number
  model: string
  fromCache: boolean
}

interface PreviewActivity {
  messageId: number
  activity: string
  category: string
  sender: string
  funScore: number
  interestingScore: number
  confidence: number
  originalMessage: string
  venue: string | null
  city: string | null
}

describe('preview command', () => {
  it('classifies on first run, uses cache on second run', { timeout: 60000 }, () => {
    // First run: fresh classification
    const run1 = runCli(
      `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Found')
    expect(run1.stdout).toContain('activities')
    // First run should NOT show cached for the activities found line
    expect(run1.stdout).not.toMatch(/Found.*activities.*cached/)

    // Second run: should use cached classification
    const run2 = runCli(
      `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toMatch(/Found.*activities.*📦 cached/)
  })

  it('writes preview_stats.json to cache', () => {
    const stats = readCacheJson<PreviewStats>(testState.tempCacheDir, 'preview_stats.json')
    expect(stats.candidatesClassified).toBeGreaterThanOrEqual(10)
    expect(stats.activitiesFound).toBeGreaterThanOrEqual(10)
    expect(stats.model).toBe('google/gemini-2.5-flash')
  })

  it('writes preview_activities.json to cache', () => {
    const activities = readCacheJson<PreviewActivity[]>(
      testState.tempCacheDir,
      'preview_activities.json'
    )
    expect(activities.length).toBeGreaterThanOrEqual(10)

    // Check hot air balloon activity
    const hotAirBalloon = activities.find((a) =>
      a.activity.toLowerCase().includes('hot air balloon')
    )
    expect(hotAirBalloon).toBeDefined()
    expect(hotAirBalloon?.category).toBe('travel')
    expect(hotAirBalloon?.sender).toBe('Alice Smith')
    expect(hotAirBalloon?.funScore).toBeGreaterThanOrEqual(0.8)
    expect(hotAirBalloon?.interestingScore).toBeGreaterThanOrEqual(0.8)
    expect(hotAirBalloon?.confidence).toBe(1)

    // Check whale safari activity
    const whaleSafari = activities.find((a) => a.activity.toLowerCase().includes('whale'))
    expect(whaleSafari).toBeDefined()
    expect(whaleSafari?.category).toBe('nature')
    expect(whaleSafari?.sender).toBe('John Smith')
    expect(whaleSafari?.city).toBe('Auckland')

    // Check Bay of Islands activity
    const bayOfIslands = activities.find((a) => a.activity.includes('Bay of Islands'))
    expect(bayOfIslands).toBeDefined()
    expect(bayOfIslands?.category).toBe('travel')
    expect(bayOfIslands?.sender).toBe('Alice Smith')
  })

  it('shows classified activities in output', { timeout: 60000 }, () => {
    const { stdout } = runCli(
      `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )

    expect(stdout).toContain('hot air balloon')
    expect(stdout).toContain('Bay of Islands')
  })

  it('respects --max-results flag', { timeout: 60000 }, () => {
    const { stdout } = runCli(
      `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" -n 3`
    )

    // Should only show 3 numbered activities
    expect(stdout).toContain('1.')
    expect(stdout).toContain('2.')
    expect(stdout).toContain('3.')
    // Line "4." should not appear as an activity number
    expect(stdout).not.toMatch(/^4\./m)
  })

  it('respects --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --dry-run`
    )

    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toContain('dry run')
  })
})
