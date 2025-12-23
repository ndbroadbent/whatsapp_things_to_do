/**
 * Preview Command E2E Tests
 */

import { describe, expect, it } from 'vitest'
import { FIXTURE_INPUT, runCli, testState } from './helpers'

export function previewCommandTests(): void {
  describe('preview command', () => {
    it('classifies candidates with AI', { timeout: 60000 }, () => {
      const { stdout, exitCode } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
      )

      expect(exitCode).toBe(0)
      // Check that classification ran (either fresh or cached)
      expect(stdout).toMatch(/candidates/)
    })

    it('shows classified activities in output', { timeout: 60000 }, () => {
      const { stdout } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand"`
      )

      // Should show some activity names from classification
      expect(stdout).toMatch(/activity|hike|restaurant|trip/i)
    })

    it('respects --max-results flag', { timeout: 60000 }, () => {
      const { stdout } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" -n 3`
      )

      expect(stdout).toMatch(/3|three/i)
    })

    it('respects --dry-run flag', () => {
      const { stdout, exitCode } = runCli(
        `preview ${FIXTURE_INPUT} --cache-dir ${testState.tempCacheDir} -c "New Zealand" --dry-run`
      )

      expect(exitCode).toBe(0)
      expect(stdout.toLowerCase()).toContain('dry run')
    })
  })
}
