/**
 * Filter Step
 *
 * Combines heuristic and embedding-based candidate extraction.
 * Runs scan + embed + semantic search + merge → candidates.all
 */

import { extractCandidatesByEmbeddings } from '../../extraction/index'
import type { CandidateMessage, ParsedMessage } from '../../types'
import type { PipelineContext } from './context'

/**
 * Filter step options.
 */
interface FilterOptions {
  /** Minimum confidence threshold */
  readonly minConfidence?: number | undefined
  /** Skip logging */
  readonly quiet?: boolean | undefined
}

/**
 * Result of the filter step.
 */
interface FilterResult {
  /** All candidates (merged from heuristics + embeddings) */
  readonly candidates: readonly CandidateMessage[]
  /** Whether result was from cache */
  readonly fromCache: boolean
  /** Stats */
  readonly stats: {
    readonly total: number
    readonly heuristics: number
    readonly embeddings: number
  }
}

/**
 * Merge heuristics and embeddings candidates, deduplicating by messageId.
 */
export function mergeCandidates(
  heuristics: readonly CandidateMessage[],
  embeddings: readonly CandidateMessage[]
): CandidateMessage[] {
  const seen = new Set<number>()
  const merged: CandidateMessage[] = []

  // Heuristics first (higher priority)
  for (const c of heuristics) {
    if (!seen.has(c.messageId)) {
      seen.add(c.messageId)
      merged.push(c)
    }
  }

  // Then embeddings
  for (const c of embeddings) {
    if (!seen.has(c.messageId)) {
      seen.add(c.messageId)
      merged.push(c)
    }
  }

  return merged
}

/**
 * Run the filter step.
 *
 * Combines heuristics (from scan) and embeddings (from embed + semantic search).
 * Uses pipeline cache if available.
 */
export async function stepFilter(
  ctx: PipelineContext,
  options?: FilterOptions
): Promise<FilterResult> {
  const { pipelineCache, apiCache, logger, noCache } = ctx

  // Check cache for merged candidates
  if (!noCache && pipelineCache.hasStage('candidates.all')) {
    const cached = pipelineCache.getStage<CandidateMessage[]>('candidates.all') ?? []
    if (!options?.quiet) {
      logger.log('\n🔍 Filtering candidates... 📦 cached')
    }
    return {
      candidates: cached,
      fromCache: true,
      stats: { total: cached.length, heuristics: 0, embeddings: 0 }
    }
  }

  // Get heuristics candidates (from scan step cache)
  const heuristics = pipelineCache.getStage<CandidateMessage[]>('candidates.heuristics') ?? []

  // Get embeddings candidates
  let embeddings: CandidateMessage[] = []
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    // Check embeddings cache
    if (pipelineCache.hasStage('candidates.embeddings')) {
      embeddings = pipelineCache.getStage<CandidateMessage[]>('candidates.embeddings') ?? []
    } else {
      // Get messages for semantic search
      const messages = pipelineCache.getStage<ParsedMessage[]>('messages') ?? []

      if (!options?.quiet) {
        logger.log('\n🔍 Extracting candidates (semantic search)...')
      }

      const result = await extractCandidatesByEmbeddings(messages, { apiKey }, undefined, apiCache)
      if (result.ok) {
        embeddings = [...result.value]
        pipelineCache.setStage('candidates.embeddings', embeddings)
      }
    }
  }

  // Merge and deduplicate
  const merged = mergeCandidates(heuristics, embeddings)

  // Cache merged results
  pipelineCache.setStage('candidates.all', merged)
  pipelineCache.setStage('filter_stats', {
    total: merged.length,
    heuristics: heuristics.length,
    embeddings: embeddings.length
  })

  if (!options?.quiet) {
    logger.log(`\n🔍 Filtering candidates...`)
    logger.log(
      `   ✓ ${merged.length} candidates (${heuristics.length} heuristics, ${embeddings.length} embeddings)`
    )
  }

  return {
    candidates: merged,
    fromCache: false,
    stats: {
      total: merged.length,
      heuristics: heuristics.length,
      embeddings: embeddings.length
    }
  }
}
