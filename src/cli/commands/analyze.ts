/**
 * Analyze Command
 *
 * Full pipeline: parse → scan → embed → filter → scrape → classify → geocode → fetch-images → export
 *
 * This is the main entry point for processing a chat export end-to-end.
 */

import type { CLIArgs } from '../args'
import { initCommandContext } from '../helpers'
import type { Logger } from '../logger'
import { StepRunner } from '../steps/runner'

export async function cmdAnalyze(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx } = await initCommandContext('Analyze', args, logger)

  const runner = new StepRunner(ctx, args, logger)

  // Run full pipeline through export
  const { exportedFiles } = await runner.run('export')

  // Summary
  logger.log('\n✨ Export complete!')
  for (const [format, path] of exportedFiles) {
    logger.log(`   ${format}: ${path}`)
  }
}
