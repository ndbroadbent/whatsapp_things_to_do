/**
 * Scan Step
 *
 * Heuristic scan for candidate messages.
 */

import { extractCandidatesByHeuristics } from '../../extraction/heuristics/index'
import type { CandidateMessage } from '../../types'
import type { PipelineContext } from './context'
import { stepParse } from './parse'

/**
 * Stats saved to scan_stats.json
 */
interface ScanStats {
  readonly totalUnique: number
  readonly regexMatches: number
  readonly urlMatches: number
}

/**
 * Result of the scan step.
 */
interface ScanResult {
  /** Extracted candidates */
  readonly candidates: readonly CandidateMessage[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Scan stats */
  readonly stats: ScanStats
}

/**
 * Scan step options.
 */
interface ScanOptions {
  /** Minimum confidence threshold */
  readonly minConfidence?: number | undefined
  /** Limit messages (for testing) */
  readonly maxMessages?: number | undefined
  /** Skip logging */
  readonly quiet?: boolean | undefined
}

/**
 * Run the scan step (heuristics only).
 *
 * Chains: parse → scan
 */
export function stepScan(ctx: PipelineContext, options?: ScanOptions): ScanResult {
  const { pipelineCache, logger, skipPipelineCache } = ctx

  // Check cache (skip if skipPipelineCache - e.g. --max-messages or --no-cache)
  if (!skipPipelineCache && pipelineCache.hasStage('candidates.heuristics')) {
    const candidates = pipelineCache.getStage<CandidateMessage[]>('candidates.heuristics') ?? []
    const stats = pipelineCache.getStage<ScanStats>('scan_stats') ?? {
      totalUnique: candidates.length,
      regexMatches: 0,
      urlMatches: 0
    }
    if (!options?.quiet) {
      logger.log('\n🔍 Scanning for candidates... 📦 cached')
    }
    return { candidates, fromCache: true, stats }
  }

  // Get messages from parse step (uses cache if available)
  const parseResult = stepParse(ctx, {
    maxMessages: options?.maxMessages,
    quiet: options?.quiet
  })

  // Scan for candidates
  if (!options?.quiet) {
    logger.log('\n🔍 Scanning for candidates...')
  }

  const extractorOptions =
    options?.minConfidence !== undefined ? { minConfidence: options.minConfidence } : undefined
  const result = extractCandidatesByHeuristics(parseResult.messages, extractorOptions)

  const stats: ScanStats = {
    totalUnique: result.totalUnique,
    regexMatches: result.regexMatches,
    urlMatches: result.urlMatches
  }

  // Cache candidates and stats
  pipelineCache.setStage('candidates.heuristics', [...result.candidates])
  pipelineCache.setStage('scan_stats', stats)

  return {
    candidates: result.candidates,
    fromCache: false,
    stats
  }
}
