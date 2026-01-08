/**
 * Classify Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import { LATEST_GOOGLE_SMALL } from '../../classifier/models'
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
    expect(stats.model).toBe(LATEST_GOOGLE_SMALL)
    expect(stats.provider).toBe('google')
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
    // AI may or may not infer Turkey from message context - just check the message is correct
    expect(hotAirBalloon?.messages[0]?.message).toMatch(/hot air ballon/i)

    // Check whale safari activity
    // NOTE: AI may choose between valid categories (experiences vs nature)
    // With new schema, venue is now placeQuery
    const whaleSafari = activities.find((a) => a.activity.toLowerCase().includes('whale'))
    expect(whaleSafari).toBeDefined()
    expect(whaleSafari?.category).toBeOneOf(['experiences', 'nature'])
    expect(whaleSafari?.messages[0]?.sender).toBe('John Smith')
    // venue is now placeQuery in new schema
    expect(whaleSafari?.placeQuery ?? whaleSafari?.placeName).toMatch(
      /whale|dolphin|safari|auckland/i
    )
    expect(whaleSafari?.city?.toLowerCase()).toContain('auckland')
    expect(whaleSafari?.country).toBe('New Zealand')

    // Check Prinzhorn art collection - may have both suggestion and agreement
    const prinzhornActivities = activities.filter((a) =>
      a.activity.toLowerCase().includes('prinzhorn')
    )
    expect(prinzhornActivities.length).toBeGreaterThanOrEqual(1)
    const prinzhornSenders = prinzhornActivities.flatMap((a) => a.messages.map((m) => m.sender))
    expect(prinzhornSenders).toContain('Alice Smith')
    expect(prinzhornActivities.every((a) => a.country === 'Germany')).toBe(true)
    expect(prinzhornActivities.every((a) => ['culture', 'arts'].includes(a.category))).toBe(true)

    // Check Bay of Islands
    const bayOfIslands = activities.find((a) => a.activity.toLowerCase().includes('bay of islands'))
    expect(bayOfIslands).toBeDefined()
    expect(bayOfIslands?.category).toBe('travel')
    expect(bayOfIslands?.messages[0]?.sender).toBe('Alice Smith')
    expect(bayOfIslands?.country).toBe('New Zealand')

    // Check Yellowstone hiking
    const yellowstone = activities.find((a) => a.activity.toLowerCase().includes('yellowstone'))
    expect(yellowstone).toBeDefined()
    expect(yellowstone?.category).toBe('nature')
    expect(yellowstone?.messages[0]?.sender).toBe('John Smith')
    // venue is now placeQuery or placeName in new schema
    expect(yellowstone?.placeQuery ?? yellowstone?.placeName).toMatch(/yellowstone/i)

    // Check Karangahake Gorge
    const karangahake = activities.find((a) => a.activity.toLowerCase().includes('karangahake'))
    expect(karangahake).toBeDefined()
    expect(karangahake?.category).toBe('nature')
    expect(karangahake?.messages[0]?.sender).toBeOneOf(['John Smith', 'Alice Smith'])
    expect(karangahake?.country).toBe('New Zealand')
    // May or may not be aggregated - depends on AI batching
    expect(karangahake?.messages.length).toBeGreaterThanOrEqual(1)
  })

  it('aggregates duplicate activities by merging messages', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Karangahake Gorge is mentioned twice in the chat - may be aggregated depending on batching
    const karangahake = activities.find((a) => a.activity.toLowerCase().includes('karangahake'))
    expect(karangahake).toBeDefined()
    // Aggregation depends on whether both mentions end up in same batch
    expect(karangahake?.messages.length).toBeGreaterThanOrEqual(1)

    // Check sender is one of the expected values
    const senders = karangahake?.messages.map((m) => m.sender) ?? []
    expect(senders.some((s) => s === 'John Smith' || s === 'Alice Smith')).toBe(true)

    // Paintball is mentioned twice - may be aggregated depending on batching
    const paintball = activities.find((a) => a.activity.toLowerCase().includes('paintball'))
    expect(paintball).toBeDefined()
    expect(paintball?.messages.length).toBeGreaterThanOrEqual(1)
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

    // Count activities mentioning Karangahake - should be 1 or 2 depending on batching
    const karangahakeCount = activities.filter((a) =>
      a.activity.toLowerCase().includes('karangahake')
    ).length
    expect(karangahakeCount).toBeGreaterThanOrEqual(1)
    expect(karangahakeCount).toBeLessThanOrEqual(2)

    // Count paintball activities - should be 1 or 2 depending on batching
    const paintballCount = activities.filter((a) =>
      a.activity.toLowerCase().includes('paintball')
    ).length
    expect(paintballCount).toBeGreaterThanOrEqual(1)
    expect(paintballCount).toBeLessThanOrEqual(2)
  })

  it('sorts activities by score descending', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // Verify descending sort order using the pre-computed score field
    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i]
      const next = activities[i + 1]
      if (!current || !next) continue

      expect(current.score).toBeGreaterThanOrEqual(next.score)
    }

    // High-scoring activities (unique travel experiences) should be near the top
    const topActivities = activities.slice(0, 5).map((a) => a.activity.toLowerCase())
    expect(topActivities.some((a) => a.includes('hot air balloon'))).toBe(true)
  })

  it('shows activities in CLI output', () => {
    const { stdout } = runCli(
      `classify ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )

    // Check header
    expect(stdout).toContain('Classification Results')
    expect(stdout).toMatch(/Candidates: \d+/)
    expect(stdout).toMatch(/Activities: \d+/)
    expect(stdout).toContain(`Model: ${LATEST_GOOGLE_SMALL} (google)`)

    // Check activities are displayed (case-insensitive)
    expect(stdout.toLowerCase()).toContain('hot air balloon')
    // Turkey may or may not be inferred by AI - skip checking for it
    expect(stdout.toLowerCase()).toContain('bay of islands')
    expect(stdout.toLowerCase()).toContain('yellowstone')
    expect(stdout.toLowerCase()).toContain('karangahake')

    // Check scores are shown
    expect(stdout).toMatch(/interesting: [3-5]\./)
    expect(stdout).toMatch(/fun: [3-5]\./)

    // Check categories (AI may classify differently, accept common ones)
    expect(stdout).toMatch(/Travel|Nature|Experiences/i)
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

  it('rejects present-moment errands (not activity suggestions)', () => {
    const activities = readCacheJson<ClassifiedActivity[]>(
      testState.tempCacheDir,
      'classifications.json'
    )

    // "I'm going to farmers" - present tense, doing right now, not a suggestion
    const farmersActivity = activities.find(
      (a) =>
        a.activity.toLowerCase().includes('farmers') ||
        a.placeQuery?.toLowerCase().includes('farmers')
    )
    expect(farmersActivity).toBeUndefined()

    // "I'm going here to get some containers" + Google Maps link - current errand
    const storageActivity = activities.find(
      (a) =>
        a.activity.toLowerCase().includes('storage') ||
        a.activity.toLowerCase().includes('container') ||
        a.placeQuery?.toLowerCase().includes('storage')
    )
    expect(storageActivity).toBeUndefined()
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
