/**
 * Scrape URLs Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import type { ScrapedMetadata } from '../../scraper/types'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface ScrapeStats {
  urlCount: number
  successCount: number
  failedCount: number
  cachedCount: number
}

interface ScrapeMetadataCache {
  allUrls: string[]
  entries: Array<[string, ScrapedMetadata]>
}

describe('scrape-urls command', () => {
  it('scrapes on first run, uses cache on second run', () => {
    // First run: fresh scrape
    const run1 = runCli(`scrape-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('Scraping')
    expect(run1.stdout).toContain('URLs')

    // Second run: should use cache
    const run2 = runCli(`scrape-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('Scraping URLs... 📦 cached')
  })

  it('shows scrape stats', () => {
    const { stdout } = runCli(`scrape-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Scrape Results')
    expect(stdout).toContain('Total URLs:')
    expect(stdout).toContain('Successful:')
    expect(stdout).toContain('Failed:')
  })

  it('writes scrape_stats.json to cache', () => {
    const stats = readCacheJson<ScrapeStats>(testState.tempCacheDir, 'scrape_stats.json')
    expect(stats.urlCount).toBeGreaterThanOrEqual(5)
    // cachedCount depends on API cache from fixture
    expect(stats.cachedCount).toBeGreaterThanOrEqual(0)
  })

  it('writes scrape_metadata.json with all scraped URLs', () => {
    const cache = readCacheJson<ScrapeMetadataCache>(testState.tempCacheDir, 'scrape_metadata.json')

    // Check expected URLs are present
    expect(cache.allUrls).toContain('https://tinyurl.com/a6vzxrj4')
    expect(cache.allUrls).toContain('https://whalewatchingauckland.com/')
    expect(cache.allUrls).toContain('https://en.wikipedia.org/wiki/The_Matrix')
    expect(cache.allUrls).toContain('https://www.reddit.com/r/oddlysatisfying/s/6jHbC0UQEi')

    // Convert entries to a Map for easier lookup
    const metadataMap = new Map(cache.entries)

    // tinyurl: scrape failed but redirect URL captured
    const tinyurlMeta = metadataMap.get('https://tinyurl.com/a6vzxrj4')
    expect(tinyurlMeta).toBeDefined()
    expect(tinyurlMeta?.canonicalUrl).toBe(
      'https://fakesiteexample.com/blog/go-hiking-at-yellowstone-tips'
    )

    // whalewatching: successful scrape with title
    const whaleMeta = metadataMap.get('https://whalewatchingauckland.com/')
    expect(whaleMeta).toBeDefined()
    expect(whaleMeta?.title).toContain('Whale')

    // wikipedia: successful scrape
    const wikiMeta = metadataMap.get('https://en.wikipedia.org/wiki/The_Matrix')
    expect(wikiMeta).toBeDefined()
    expect(wikiMeta?.title).toContain('Matrix')

    // reddit: successful scrape via redirect with title
    const redditMeta = metadataMap.get('https://www.reddit.com/r/oddlysatisfying/s/6jHbC0UQEi')
    expect(redditMeta).toBeDefined()
    expect(redditMeta?.canonicalUrl).toContain('/comments/')
    expect(redditMeta?.title).toContain('affogato')
    expect(redditMeta?.description).toContain('oddlysatisfying')
  })

  it('shows scraped URLs in output', () => {
    const { stdout } = runCli(`scrape-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Scraped URLs')
    // Should find at least one URL with scraped metadata
    expect(stdout).toContain('Title:')
  })

  it('shows redirect URL for tinyurl even though scrape failed', () => {
    const { stdout } = runCli(`scrape-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    // tinyurl redirects to fakesiteexample.com - should show the redirect
    expect(stdout).toContain('tinyurl.com')
    expect(stdout).toContain('fakesiteexample.com/blog/go-hiking-at-yellowstone')
  })

  it('supports --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `scrape-urls ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --dry-run`
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('dry run')
    expect(stdout).not.toContain('Scrape Results')
  })
})
