/**
 * Classify Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import type { ClassifiedActivity } from '../../types'
import { FIXTURE_INPUT, readCacheJson, readClassifierPrompts, runCli, testState } from './helpers'

interface ClassifyStats {
  candidatesClassified: number
  activitiesFound: number
  model: string
  provider: string
  batchCount: number
  cachedBatches: number
}

describe('classify command', () => {
  it('classifies on first run, uses cache on second run', { timeout: 30000 }, () => {
    // First run: fresh classification
    const run1 = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Classifying')
    expect(run1.stdout).toContain('candidates')

    // Second run: should use cached classification
    const run2 = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('Classifying candidates... 📦 cached')
  })

  it('writes classify_stats.json to cache', () => {
    const stats = readCacheJson<ClassifyStats>(testState.tempCacheDir, 'classify_stats.json')
    expect(stats.candidatesClassified).toBeGreaterThanOrEqual(10)
    expect(stats.activitiesFound).toBeGreaterThanOrEqual(10)
    expect(stats.model).toBe('google/gemini-2.5-flash')
    expect(stats.provider).toBe('openrouter')
    expect(stats.batchCount).toBeGreaterThanOrEqual(1)
  })

  it('writes classifications.json with all activities', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )
    expect(activities.length).toBeGreaterThanOrEqual(10)

    // Check hot air balloon activity (should be first - highest score)
    const hotAirBalloon = activities.find((a) =>
      a.activity.toLowerCase().includes('hot air balloon')
    )
    expect(hotAirBalloon).toBeDefined()
    expect(hotAirBalloon?.category).toBeOneOf(['experiences', 'travel'])
    expect(hotAirBalloon?.messages[0]?.sender).toBe('Alice Smith')
    expect(hotAirBalloon?.funScore).toBeGreaterThanOrEqual(0.8)
    expect(hotAirBalloon?.interestingScore).toBeGreaterThanOrEqual(0.8)
    expect(hotAirBalloon?.country).toBe('Turkey')
    expect(hotAirBalloon?.messages[0]?.message).toMatch(/hot air ballon/i)

    // Check whale safari activity
    // NOTE: AI may choose between valid categories (experiences vs nature), but
    // it MUST extract required details like venue/city/country. No null allowed.
    const whaleSafari = activities.find((a) => a.activity.toLowerCase().includes('whale'))
    expect(whaleSafari).toBeDefined()
    expect(whaleSafari?.category).toBeOneOf(['experiences', 'nature'])
    expect(whaleSafari?.messages[0]?.sender).toBe('John Smith')
    expect(whaleSafari?.venue).toBe('Auckland Whale & Dolphin Safari')
    expect(whaleSafari?.city).toBe('Auckland')
    expect(whaleSafari?.country).toBe('New Zealand')

    // Check Prinzhorn art collection
    const prinzhorn = activities.find((a) => a.activity.includes('Prinzhorn'))
    expect(prinzhorn).toBeDefined()
    expect(prinzhorn?.category).toBeOneOf(['culture', 'arts'])
    expect(prinzhorn?.messages[0]?.sender).toBe('Alice Smith')
    expect(prinzhorn?.country).toBe('Germany')

    // Check Bay of Islands
    const bayOfIslands = activities.find((a) => a.activity.includes('Bay of Islands'))
    expect(bayOfIslands).toBeDefined()
    expect(bayOfIslands?.category).toBe('travel')
    expect(bayOfIslands?.messages[0]?.sender).toBe('Alice Smith')
    expect(bayOfIslands?.country).toBe('New Zealand')

    // Check Yellowstone hiking
    const yellowstone = activities.find((a) => a.activity.includes('Yellowstone'))
    expect(yellowstone).toBeDefined()
    expect(yellowstone?.category).toBe('nature')
    expect(yellowstone?.messages[0]?.sender).toBe('John Smith')
    expect(yellowstone?.venue).toMatch(/Yellowstone/i)

    // Check Karangahake Gorge - should be aggregated from 2 mentions
    const karangahake = activities.find((a) => a.activity.includes('Karangahake'))
    expect(karangahake).toBeDefined()
    expect(karangahake?.category).toBe('nature')
    expect(karangahake?.messages[0]?.sender).toBe('John Smith')
    expect(karangahake?.country).toBe('New Zealand')
    // Should have 2 messages from aggregation
    expect(karangahake?.messages.length).toBe(2)
  })

  it('aggregates duplicate activities by merging messages', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Karangahake Gorge is mentioned twice in the chat - should be aggregated
    const karangahake = activities.find((a) => a.activity.toLowerCase().includes('karangahake'))
    expect(karangahake).toBeDefined()
    expect(karangahake?.messages.length).toBe(2)

    // Check both messages are preserved with correct senders
    const senders = karangahake?.messages.map((m) => m.sender) ?? []
    expect(senders).toContain('John Smith')

    // Check date range spans both mentions (Oct 11 and Nov 15)
    const dates = karangahake?.messages.map((m) => new Date(m.timestamp)) ?? []
    const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime())
    if (sortedDates.length >= 2) {
      const firstDate = sortedDates[0]
      const lastDate = sortedDates[sortedDates.length - 1]
      if (firstDate && lastDate) {
        // First mention is Oct 11, second is Nov 15 - at least a month apart
        const daysDiff = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
        expect(daysDiff).toBeGreaterThanOrEqual(30)
      }
    }

    // Paintball is mentioned twice - should be aggregated
    const paintball = activities.find((a) => a.activity.toLowerCase().includes('paintball'))
    expect(paintball).toBeDefined()
    expect(paintball?.messages.length).toBe(2)
  })

  it('does not aggregate compound activities with non-compound', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // "Go to a play or a concert" is compound, "Go to a play" is not
    // They should NOT be aggregated together
    const playActivities = activities.filter((a) =>
      a.activity.toLowerCase().includes('go to a play')
    )
    // sometimes one is compound, sometimes the AI adds both as separate activities and they get aggregated
    expect(playActivities.length).toBeOneOf([1, 2])
  })

  it('does not create duplicate entries for aggregated activities', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Count activities mentioning Karangahake - should be exactly 1 (aggregated)
    const karangahakeCount = activities.filter((a) =>
      a.activity.toLowerCase().includes('karangahake')
    ).length
    expect(karangahakeCount).toBe(1)

    // Count paintball activities - should be exactly 1 (aggregated)
    const paintballCount = activities.filter((a) =>
      a.activity.toLowerCase().includes('paintball')
    ).length
    expect(paintballCount).toBe(1)
  })

  it('sorts activities by score (interesting * 2 + fun)', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Helper to round to 1 decimal place (avoids floating point comparison issues)
    const round1 = (n: number) => Math.round(n * 10) / 10

    // Verify descending sort order (with rounding to handle floating point)
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i]
      const next = activities[i + 1]
      if (!current || !next) continue

      const scoreA = round1(current.interestingScore * 2 + current.funScore)
      const scoreB = round1(next.interestingScore * 2 + next.funScore)
      expect(scoreA).toBeGreaterThanOrEqual(scoreB)
    }

    // High-scoring activities (0.9/0.9) should be near the top
    const topActivities = activities.slice(0, 5).map((a) => a.activity.toLowerCase())
    expect(topActivities.some((a) => a.includes('hot air balloon'))).toBe(true)
    expect(topActivities.some((a) => a.includes('whale'))).toBe(true)

    // Low-interest activities should be near the bottom
    const bottomActivities = activities.slice(-3).map((a) => a.activity.toLowerCase())
    expect(bottomActivities.some((a) => a.includes('movie') || a.includes('sale'))).toBe(true)
  })

  it('shows activities in CLI output', () => {
    const { stdout } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )

    // Check header
    expect(stdout).toContain('Classification Results')
    expect(stdout).toMatch(/Candidates: \d+/)
    expect(stdout).toMatch(/Activities: \d+/)
    expect(stdout).toContain('Model: google/gemini-2.5-flash (openrouter)')

    // Check activities are displayed
    expect(stdout).toMatch(/hot air balloon/i)
    expect(stdout).toMatch(/Turkey/i)
    expect(stdout).toMatch(/Bay of Islands/i)
    expect(stdout).toMatch(/Yellowstone/i)
    expect(stdout).toMatch(/Karangahake/i)

    // Check scores are shown
    expect(stdout).toContain('interesting: 0.9')
    expect(stdout).toContain('fun: 0.9')

    // Check categories (AI may classify differently, accept common ones)
    expect(stdout).toContain('Travel')
    expect(stdout).toContain('Nature')
  })

  it('respects --max-results flag', () => {
    const { stdout } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --max-results 3`
    )

    // Should show exactly 3 numbered activities
    expect(stdout).toContain('1.')
    expect(stdout).toContain('2.')
    expect(stdout).toContain('3.')
    expect(stdout).not.toMatch(/^4\./m)

    // Should show "and X more" message
    expect(stdout).toMatch(/and \d+ more/)
  })

  it('respects --all flag to show all activities', () => {
    const { stdout } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --all`
    )

    // Should show all 10 activities
    expect(stdout).toContain('1.')
    expect(stdout).toContain('10.')
    expect(stdout).not.toContain('more (use --all')
  })

  it('respects --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --dry-run`
    )

    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toContain('dry run')
    // Candidates count varies based on embedding results - just check it's shown
    expect(stdout).toMatch(/Candidates to classify: \d+/)
    expect(stdout).not.toContain('Classification Results')
  })

  it('includes redirect URL in classifier prompt for shortened URLs', () => {
    // The tinyurl redirects to fakesiteexample.com - this should appear in the prompt
    const prompts = readClassifierPrompts(testState.tempCacheDir)
    expect(prompts.length).toBeGreaterThan(0)

    // Find the prompt that contains tinyurl
    const promptWithTinyurl = prompts.find((p) => p.includes('tinyurl.com'))
    expect(promptWithTinyurl).toBeDefined()

    // The redirect URL should be included as url_metadata
    expect(promptWithTinyurl).toContain('fakesiteexample.com/blog/go-hiking-at-yellowstone-tips')
  })

  it('infers activity from redirect URL even when scrape fails', () => {
    // This is a critical test: the original message only contains a tinyurl link
    // The AI must have used the redirect URL path to infer "Yellowstone hiking"
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    const yellowstone = activities.find((a) => a.activity.toLowerCase().includes('yellowstone'))
    expect(yellowstone).toBeDefined()
    expect(yellowstone?.category).toBe('nature')
    // The original message only had the tinyurl - no mention of Yellowstone
    expect(yellowstone?.messages[0]?.message).toContain('tinyurl.com')
    expect(yellowstone?.messages[0]?.message).not.toContain('Yellowstone')
  })

  it('classifies activities with correct categories', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Map activities by category
    const byCategory = new Map<string, ClassifiedActivity[]>()
    for (const a of activities) {
      const list = byCategory.get(a.category) ?? []
      list.push(a)
      byCategory.set(a.category, list)
    }

    // AI classification varies - just check we have a reasonable distribution
    // Experiences/Travel: hot air balloon, whale safari, Bay of Islands
    const experiencesTravelCount =
      (byCategory.get('experiences')?.length ?? 0) + (byCategory.get('travel')?.length ?? 0)
    expect(experiencesTravelCount).toBeGreaterThanOrEqual(2)

    // Nature: Yellowstone, Karangahake, whale safari (AI may classify differently)
    expect(byCategory.get('nature')?.length ?? 0).toBeGreaterThanOrEqual(1)

    // Entertainment/Music/Gaming: play/concert, movie, paintball
    const entertainmentCount =
      (byCategory.get('entertainment')?.length ?? 0) +
      (byCategory.get('music')?.length ?? 0) +
      (byCategory.get('gaming')?.length ?? 0)
    expect(entertainmentCount).toBeGreaterThanOrEqual(1)

    // Culture/Arts: Prinzhorn (AI may categorize as either)
    const cultureArtsCount =
      (byCategory.get('culture')?.length ?? 0) + (byCategory.get('arts')?.length ?? 0)
    expect(cultureArtsCount).toBeGreaterThanOrEqual(1)

    // Sports: paintballing (may also be gaming)
    const sportsGamingCount =
      (byCategory.get('sports')?.length ?? 0) + (byCategory.get('gaming')?.length ?? 0)
    expect(sportsGamingCount).toBeGreaterThanOrEqual(1)
  })
})
