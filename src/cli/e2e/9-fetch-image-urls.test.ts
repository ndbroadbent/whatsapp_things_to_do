/**
 * Fetch Image URLs Command E2E Tests
 *
 * ⚠️ NOTE: Scraped/OG images are NOT used for activity images.
 * OG images can only be used for inline link previews.
 * See project_docs/IMAGES.md for licensing rules.
 */

import { describe, expect, it } from 'vitest'
import type { ImageResult } from '../../images/types'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface FetchImagesStats {
  activitiesProcessed: number
  imagesFound: number
  fromCdn: number
  fromGooglePlaces: number
  fromWikipedia: number
  fromPixabay: number
  fromUserUpload: number
  failed: number
}

interface CachedImageData {
  entries: Array<[string, ImageResult | null]>
}

describe('fetch-image-urls command', () => {
  it('fetches images on first run, uses cache on second run', { timeout: 60000 }, () => {
    // First run: fresh fetch
    const run1 = runCli(
      `fetch-image-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --no-image-cdn`
    )
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toMatch(/fetching images/i)
    // First run should NOT show cached
    expect(run1.stdout).not.toMatch(/fetching images.*cached/i)

    // Second run: should use cached images
    const run2 = runCli(
      `fetch-image-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --no-image-cdn`
    )
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toMatch(/fetching images.*cached/i)
  })

  it('writes fetch_images_stats.json to cache', () => {
    const stats = readCacheJson<FetchImagesStats>(testState.tempCacheDir, 'fetch_images_stats.json')
    expect(stats.activitiesProcessed).toBeGreaterThanOrEqual(10)
    expect(stats.imagesFound).toBeGreaterThanOrEqual(10)
    // With --no-image-cdn, images come from Google Places or Pixabay
    // NOTE: Scraped/OG images are NOT used (licensing restrictions)
    expect(stats.fromGooglePlaces).toBeGreaterThanOrEqual(4)
    expect(stats.fromPixabay).toBeGreaterThanOrEqual(4)
  })

  it('writes images.json with image results keyed by activityId', () => {
    const cache = readCacheJson<CachedImageData>(testState.tempCacheDir, 'images.json')
    expect(cache.entries.length).toBeGreaterThanOrEqual(10)

    // All keys should be 16-char hex strings (activityId format)
    for (const [key] of cache.entries) {
      expect(key).toMatch(/^[a-f0-9]{16}$/)
    }

    // Check that most activities have images
    const withImages = cache.entries.filter(([, img]) => img !== null)
    expect(withImages.length).toBeGreaterThanOrEqual(10)

    // Check image sources are correct
    // NOTE: 'scraped' is NOT a valid source - OG images can only be link previews
    const sources = withImages.map(([, img]) => img?.source)
    expect(sources).toContain('google_places')
    expect(sources).toContain('pixabay')
  })

  it('shows image results in CLI output', () => {
    const { stdout } = runCli(
      `fetch-image-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --no-image-cdn`
    )

    // Check header
    expect(stdout).toMatch(/image fetch results/i)
    expect(stdout).toMatch(/processed: \d+/i)
    expect(stdout).toMatch(/found: \d+/i)

    // Check activities are displayed with images
    expect(stdout).toMatch(/activities with images/i)
    expect(stdout).toMatch(/pixabay/i)
    expect(stdout).toMatch(/google_places/i)

    // Check specific activities appear with their images
    expect(stdout).toMatch(/hot air balloon/i)
    expect(stdout).toMatch(/whale/i)
    expect(stdout).toMatch(/bay of islands/i)
  })

  it('respects --max-results flag', () => {
    const { stdout } = runCli(
      `fetch-image-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --max-results 3`
    )

    // Should show exactly 3 numbered activities
    expect(stdout).toMatch(/1\./m)
    expect(stdout).toMatch(/2\./m)
    expect(stdout).toMatch(/3\./m)
    expect(stdout).not.toMatch(/^4\./m)

    // Should show "and X more" message
    expect(stdout).toMatch(/and \d+ more/i)
  })

  it('includes expected output in stdout for --all flag', () => {
    const { stdout } = runCli(
      `fetch-image-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --all --no-image-cdn`
    )

    // Should show all activities (at least 10)
    expect(stdout).toMatch(/1\./m)
    expect(stdout).toMatch(/10\./m)
    expect(stdout).not.toMatch(/more \(use --all/i)

    // Pixabay results should show the query used
    expect(stdout).toMatch(/pixabay \(query: "[^"]+"\)/i)

    // NOTE: Kalima Resort no longer gets scraped OG image (licensing restrictions)
    // It will get a Pixabay or Google Places image instead
    expect(stdout).toMatch(/kalima/i)

    // Venues with placeIds should get Google Places photos
    expect(stdout).toMatch(/google_places/i)
    expect(stdout).toMatch(/maps\.googleapis\.com\/maps\/api\/place\/photo/i)
  })
})
