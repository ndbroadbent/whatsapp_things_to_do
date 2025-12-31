/**
 * Filter Step
 *
 * Combines heuristic and embedding-based candidate extraction.
 * Runs scan + embed + semantic search + merge → candidates.all
 */

import { deduplicateAgreements } from '../../extraction/context-window'
import { extractCandidatesByEmbeddings } from '../../extraction/index'
import type { CandidateMessage, ParsedMessage } from '../../types'
import type { PipelineContext } from './context'

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

interface MergeResult {
  candidates: CandidateMessage[]
  agreementsRemoved: number
}

/**
 * Merge heuristics and embeddings candidates, deduplicating by messageId
 * and removing agreements that fall within a suggestion's context window.
 */
export function mergeAndDeduplicateCandidates(
  heuristics: readonly CandidateMessage[],
  embeddings: readonly CandidateMessage[],
  messages: readonly ParsedMessage[]
): MergeResult {
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

  // Deduplicate agreements across all sources
  const result = deduplicateAgreements(merged, messages)

  // Sort by messageId (chronological order) for stable batching.
  // This ensures adding more messages doesn't shift earlier batches,
  // allowing API cache hits for previously classified candidates.
  const sorted = [...result.candidates].sort((a, b) => a.messageId - b.messageId)

  return {
    candidates: sorted,
    agreementsRemoved: result.removedCount
  }
}

/**
 * Run the filter step.
 *
 * Combines heuristics (from scan) and embeddings (from embed + semantic search).
 * Uses pipeline cache if available.
 */
export async function stepFilter(ctx: PipelineContext): Promise<FilterResult> {
  const { pipelineCache, apiCache, logger, skipPipelineCache } = ctx

  // Check cache - only valid if filter_stats exists (completion marker)
  if (!skipPipelineCache && pipelineCache.hasStage('filter_stats')) {
    const cached = pipelineCache.getStage<CandidateMessage[]>('candidates.all') ?? []
    logger.log('\n🔍 Filtering candidates... 📦 cached')
    return {
      candidates: cached,
      fromCache: true,
      stats: { total: cached.length, heuristics: 0, embeddings: 0 }
    }
  }

  logger.log('\n🔍 Filtering candidates...')

  // Get heuristics candidates (from scan step cache)
  const heuristics = pipelineCache.getStage<CandidateMessage[]>('candidates.heuristics') ?? []

  // Get embeddings candidates
  let embeddings: CandidateMessage[] = []
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    // Check embeddings cache
    if (!skipPipelineCache && pipelineCache.hasStage('candidates.embeddings')) {
      embeddings = pipelineCache.getStage<CandidateMessage[]>('candidates.embeddings') ?? []
    } else {
      // Get messages for semantic search
      const messages = pipelineCache.getStage<ParsedMessage[]>('messages') ?? []

      logger.log('\n🔍 Extracting candidates (semantic search)...')

      const result = await extractCandidatesByEmbeddings(messages, { apiKey }, undefined, apiCache)
      if (result.ok) {
        embeddings = [...result.value]
        pipelineCache.setStage('candidates.embeddings', embeddings)
      }
    }
  }

  // Get messages for deduplication
  const messages = pipelineCache.getStage<ParsedMessage[]>('messages') ?? []

  // Merge and deduplicate agreements across all sources
  const { candidates: merged } = mergeAndDeduplicateCandidates(heuristics, embeddings, messages)

  // Cache merged results
  pipelineCache.setStage('candidates.all', merged)
  pipelineCache.setStage('filter_stats', {
    total: merged.length,
    heuristics: heuristics.length,
    embeddings: embeddings.length
  })

  logger.log(
    `   ✓ ${merged.length} candidates (${heuristics.length} heuristics, ${embeddings.length} embeddings)`
  )

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
