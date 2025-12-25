/**
 * Embed Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_INPUT, readCacheJson, runCli, testState } from './helpers'

interface EmbedStats {
  totalEmbedded: number
}

describe('embed command', () => {
  it('embeds on first run, uses cache on second run', { timeout: 30000 }, () => {
    // First run: fresh embed (parse may be cached, but embed itself is fresh)
    const run1 = runCli(`embed ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run1.exitCode).toBe(0)
    expect(run1.stdout).toContain('🔮 Embedding messages...')
    expect(run1.stdout).toContain('Embedded')
    // Embed step itself should NOT show cached on first run
    expect(run1.stdout).not.toMatch(/🔮 Embedding messages\.\.\..*cached/)

    // Second run: should use cache
    const run2 = runCli(`embed ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(run2.exitCode).toBe(0)
    expect(run2.stdout).toContain('🔮 Embedding messages... 📦 cached')
  })

  it('shows embedding stats', () => {
    const { stdout } = runCli(`embed ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir}`)
    expect(stdout).toContain('Embedding Stats')
    expect(stdout).toContain('Total messages:')
    expect(stdout).toContain('Messages to embed:')
    expect(stdout).toContain('API batches:')
    expect(stdout).toContain('Estimated cost:')
  })

  it('writes embed_stats.json to cache', () => {
    const stats = readCacheJson<EmbedStats>(testState.tempCacheDir, 'embed_stats.json')
    expect(stats.totalEmbedded).toBeGreaterThanOrEqual(182)
  })

  it('supports --dry-run flag', () => {
    const { stdout, exitCode } = runCli(
      `embed ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} --dry-run`
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain('Dry run')
    expect(stdout).not.toContain('Embedded')
  })
})
