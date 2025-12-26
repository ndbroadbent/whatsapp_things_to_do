/**
 * Geocode Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import type { GeocodedActivity } from '../../types'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface GeocodeStats {
  activitiesProcessed: number
  activitiesGeocoded: number
  fromGoogleMapsUrl: number
  fromGoogleGeocoding: number
  fromPlaceSearch: number
  failed: number
}

describe('geocode command', () => {
  it('geocodes on first run, uses cache on second run', { timeout: 60000 }, () => {
    // First run: fresh geocoding
    const run1 = runCli(
      `geocode ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Geocoding')
    expect(run1.stdout).toContain('activities')
    // First run should NOT show cached
    expect(run1.stdout).not.toMatch(/Geocoding.*activities.*cached/)

    // Second run: should use cached geocoding
    const run2 = runCli(
      `geocode ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('Geocoding activities... 📦 cached')
  })

  it('writes geocode_stats.json to cache', () => {
    const stats = readCacheJson<GeocodeStats>(testState.tempCacheDir, 'geocode_stats.json')
    expect(stats.activitiesProcessed).toBeGreaterThanOrEqual(10)
    expect(stats.activitiesGeocoded).toBeGreaterThanOrEqual(5)
    // Most should come from address geocoding
    expect(stats.fromGoogleGeocoding).toBeGreaterThanOrEqual(4)
    // Some activities may not have location info
    expect(stats.failed).toBeGreaterThanOrEqual(0)
  })

  it('writes geocodings.json with geocoded activities', () => {
    const activities = readCacheJson<GeocodedActivity[]>(testState.tempCacheDir, 'geocodings.json')
    expect(activities.length).toBeGreaterThanOrEqual(10)

    // Check whale safari is geocoded to Auckland
    const whaleSafari = activities.find((a) => a.activity.toLowerCase().includes('whale'))
    expect(whaleSafari).toBeDefined()
    expect(whaleSafari?.latitude).toBeDefined()
    expect(whaleSafari?.longitude).toBeDefined()
    // Auckland coordinates: around -36.8, 174.7
    expect(whaleSafari?.latitude).toBeCloseTo(-36.8, 0)
    expect(whaleSafari?.longitude).toBeCloseTo(174.7, 0)
    expect(whaleSafari?.geocodeSource).toBe('google_geocoding')

    // Check Bay of Islands is geocoded
    const bayOfIslands = activities.find((a) => a.activity.includes('Bay of Islands'))
    expect(bayOfIslands).toBeDefined()
    expect(bayOfIslands?.latitude).toBeDefined()
    expect(bayOfIslands?.longitude).toBeDefined()
    // Bay of Islands coordinates: around -35.2, 174.2
    expect(bayOfIslands?.latitude).toBeCloseTo(-35.2, 0)
    expect(bayOfIslands?.longitude).toBeCloseTo(174.2, 0)
    expect(bayOfIslands?.formattedAddress).toContain('New Zealand')

    // Check Karangahake Gorge is geocoded
    const karangahake = activities.find((a) => a.activity.includes('Karangahake'))
    expect(karangahake).toBeDefined()
    expect(karangahake?.latitude).toBeDefined()
    expect(karangahake?.longitude).toBeDefined()
    // Karangahake coordinates: around -37.4, 175.7
    expect(karangahake?.latitude).toBeCloseTo(-37.4, 0)
    expect(karangahake?.longitude).toBeCloseTo(175.7, 0)

    // Check Prinzhorn (Heidelberg, Germany) is geocoded
    const prinzhorn = activities.find((a) => a.activity.includes('Prinzhorn'))
    expect(prinzhorn).toBeDefined()
    expect(prinzhorn?.latitude).toBeDefined()
    expect(prinzhorn?.longitude).toBeDefined()
    // Heidelberg coordinates: around 49.4, 8.7
    expect(prinzhorn?.latitude).toBeCloseTo(49.4, 0)
    expect(prinzhorn?.longitude).toBeCloseTo(8.7, 0)
    expect(prinzhorn?.formattedAddress).toContain('Germany')

    // Check Yellowstone (USA) is geocoded correctly - NOT biased to New Zealand
    const yellowstone = activities.find((a) => a.activity.includes('Yellowstone'))
    expect(yellowstone).toBeDefined()
    expect(yellowstone?.latitude).toBeDefined()
    expect(yellowstone?.longitude).toBeDefined()
    // Yellowstone is in Wyoming, USA - latitude should be ~44-46 (NOT New Zealand's -40)
    expect(yellowstone?.latitude).toBeGreaterThan(40)
    expect(yellowstone?.latitude).toBeLessThan(50)
    expect(yellowstone?.longitude).toBeLessThan(-100)
    expect(yellowstone?.formattedAddress).toMatch(/USA|United States/)

    // Check Turkey hot air balloon is geocoded correctly - NOT biased to New Zealand
    const turkey = activities.find(
      (a) =>
        a.activity.toLowerCase().includes('hot air') || a.activity.toLowerCase().includes('balloon')
    )
    expect(turkey).toBeDefined()
    expect(turkey?.latitude).toBeDefined()
    expect(turkey?.longitude).toBeDefined()
    // Turkey coordinates: around 38-39 latitude (NOT New Zealand's -40)
    expect(turkey?.latitude).toBeGreaterThan(30)
    expect(turkey?.latitude).toBeLessThan(45)
  })

  it('shows geocoded activities in CLI output', () => {
    const { stdout } = runCli(
      `geocode ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
    )

    // Check header
    expect(stdout).toContain('Geocoding Results')
    expect(stdout).toMatch(/Processed: \d+/)
    expect(stdout).toMatch(/Geocoded: \d+/)

    // Check activities are displayed with coordinates
    expect(stdout).toContain('Geocoded Activities')
    expect(stdout).toMatch(/-?\d+\.\d+, -?\d+\.\d+/) // Coordinate pattern

    // Check specific activities appear
    expect(stdout).toMatch(/whale/i)
    expect(stdout).toMatch(/Bay of Islands/i)
    expect(stdout).toMatch(/Karangahake/i)
  })

  it('respects --max-results flag', () => {
    const { stdout } = runCli(
      `geocode ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --max-results 3`
    )

    // Should show exactly 3 numbered activities
    expect(stdout).toContain('1.')
    expect(stdout).toContain('2.')
    expect(stdout).toContain('3.')
    expect(stdout).not.toMatch(/^4\./m)

    // Should show "and X more" message
    expect(stdout).toMatch(/and \d+ more/)
  })

  it('respects --all flag to show all geocoded activities', () => {
    const { stdout } = runCli(
      `geocode ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --all`
    )

    // Should show all geocoded activities (at least 5)
    expect(stdout).toContain('1.')
    expect(stdout).toContain('5.')
    expect(stdout).not.toContain('more (use --all')
  })

  it('respects --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `geocode ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --dry-run`
    )

    expect(exitCode).toBe(0)
    expect(stdout.toLowerCase()).toContain('dry run')
    expect(stdout).toContain('Activities to geocode:')
    expect(stdout).toContain('With location info:')
    expect(stdout).not.toContain('Geocoding Results')
  })

  it('counts geocode sources correctly', () => {
    const stats = readCacheJson<GeocodeStats>(testState.tempCacheDir, 'geocode_stats.json')

    // Total should equal geocoded + failed
    expect(stats.activitiesProcessed).toBe(stats.activitiesGeocoded + stats.failed)

    // Geocoded should equal sum of all sources
    expect(stats.activitiesGeocoded).toBe(
      stats.fromGoogleMapsUrl + stats.fromGoogleGeocoding + stats.fromPlaceSearch
    )
  })

  it('preserves activity metadata after geocoding', () => {
    const activities = readCacheJson<GeocodedActivity[]>(testState.tempCacheDir, 'geocodings.json')

    // Find a geocoded activity and verify original fields are preserved
    const whaleSafari = activities.find((a) => a.activity.toLowerCase().includes('whale'))
    expect(whaleSafari).toBeDefined()

    // Original classification fields should be preserved (AI may classify as experiences or nature)
    expect(whaleSafari?.category).toBeOneOf(['experiences', 'nature'])
    expect(whaleSafari?.messages[0]?.sender).toBe('John Smith')
    expect(whaleSafari?.venue).toMatch(/Whale/i)
    expect(whaleSafari?.city).toBe('Auckland')
    expect(whaleSafari?.country).toBe('New Zealand')
    expect(whaleSafari?.funScore).toBeGreaterThanOrEqual(0.8)
    expect(whaleSafari?.interestingScore).toBeGreaterThanOrEqual(0.8)
  })

  it('handles activities without location gracefully', () => {
    const activities = readCacheJson<GeocodedActivity[]>(testState.tempCacheDir, 'geocodings.json')

    // Some activities should have no coordinates (e.g., movie night, mall sale)
    const noCoords = activities.filter((a) => a.latitude === undefined || a.longitude === undefined)
    expect(noCoords.length).toBeGreaterThanOrEqual(1)

    // These should still have their classification data
    for (const a of noCoords) {
      expect(a.activity).toBeTruthy()
      expect(a.category).toBeTruthy()
      expect(a.messages[0]?.sender).toBeTruthy()
    }
  })
})
