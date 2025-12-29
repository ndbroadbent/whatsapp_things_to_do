/**
 * Candidate Extraction Module
 *
 * Extract candidate messages likely to contain activities using:
 * - Heuristics (regex + URL patterns) - fast, free
 * - Embeddings (semantic search) - slower, requires OpenAI API
 *
 * Includes agreement deduplication to avoid classifying both suggestions
 * and their responses as separate activities.
 */

import type { ResponseCache } from '../caching/types'
import type {
  CandidateMessage,
  EmbeddingConfig,
  ExtractorOptions,
  ExtractorResult,
  ParsedMessage,
  Result,
  SemanticSearchConfig
} from '../types'
import { deduplicateAgreements } from './context-window'
import { extractCandidatesByEmbeddings } from './embeddings/index'
import { extractCandidatesByHeuristics } from './heuristics/index'

// Re-export from context-window
export { deduplicateAgreements } from './context-window'
// Re-export embeddings
export {
  ACTIVITY_TYPE_QUERIES,
  AGREEMENT_QUERIES,
  cosineSimilarity,
  DEFAULT_ACTIVITY_QUERIES,
  embedQueries,
  extractCandidatesByEmbeddings,
  findSemanticCandidates,
  findTopK,
  getAllQueryEmbeddings,
  getDefaultQueryEmbeddings,
  getQueryEmbedding,
  getQueryEmbeddingsDimensions,
  getQueryEmbeddingsModel,
  getQueryType,
  loadQueryEmbeddings,
  SUGGESTION_QUERIES
} from './embeddings/index'
// Re-export heuristics
export {
  ACTIVITY_KEYWORDS,
  ACTIVITY_PATTERNS,
  type ActivityLinkOptions,
  classifyUrl,
  EXCLUSION_PATTERNS,
  extractActivityLinks,
  extractCandidatesByHeuristics,
  extractGoogleMapsCoords,
  isActivityUrl,
  isSocialUrl
} from './heuristics/index'

export interface ExtractCandidatesConfig {
  heuristics?: ExtractorOptions
  embeddings?: {
    config: EmbeddingConfig
    search?: SemanticSearchConfig
  }
  cache?: ResponseCache
}

export interface ExtractCandidatesResult extends ExtractorResult {
  embeddingsMatches: number
  /** Number of agreement candidates removed due to overlap with suggestions. */
  agreementsRemoved: number
}

/**
 * Extract candidates using both heuristics and embeddings.
 *
 * When embeddings config is provided and OPENAI_API_KEY is available,
 * runs both extraction methods and merges results by messageId.
 * Falls back to heuristics-only when embeddings unavailable.
 *
 * Applies agreement deduplication to remove agreement candidates that
 * fall within suggestion context windows.
 */
export async function extractCandidates(
  messages: readonly ParsedMessage[],
  config?: ExtractCandidatesConfig
): Promise<Result<ExtractCandidatesResult>> {
  // Tell children to skip deduplication - we'll do it after merging
  const heuristicsOptions: ExtractorOptions = {
    ...config?.heuristics,
    skipAgreementDeduplication: true
  }

  // Always run heuristics (fast, free)
  const heuristicsResult = extractCandidatesByHeuristics(messages, heuristicsOptions)

  // If no embeddings config, apply deduplication and return heuristics only
  if (!config?.embeddings) {
    const { candidates, removedCount } = deduplicateAgreements(
      heuristicsResult.candidates,
      messages
    )
    return {
      ok: true,
      value: {
        ...heuristicsResult,
        candidates,
        totalUnique: candidates.length,
        embeddingsMatches: 0,
        agreementsRemoved: removedCount
      }
    }
  }

  // Run embeddings extraction (TODO: add skipAgreementDeduplication support)
  const embeddingsResult = await extractCandidatesByEmbeddings(
    messages,
    config.embeddings.config,
    config.embeddings.search,
    config.cache
  )

  if (!embeddingsResult.ok) {
    return embeddingsResult
  }

  // Merge by messageId, keeping highest confidence
  const candidateMap = new Map<number, CandidateMessage>()

  for (const candidate of heuristicsResult.candidates) {
    candidateMap.set(candidate.messageId, candidate)
  }

  for (const candidate of embeddingsResult.value) {
    const existing = candidateMap.get(candidate.messageId)
    if (!existing) {
      candidateMap.set(candidate.messageId, candidate)
    } else if (candidate.confidence > existing.confidence) {
      candidateMap.set(candidate.messageId, candidate)
    }
  }

  const mergedCandidates = [...candidateMap.values()]

  // Apply agreement deduplication on merged results
  const { candidates, removedCount } = deduplicateAgreements(mergedCandidates, messages)

  return {
    ok: true,
    value: {
      candidates,
      regexMatches: heuristicsResult.regexMatches,
      urlMatches: heuristicsResult.urlMatches,
      embeddingsMatches: embeddingsResult.value.length,
      totalUnique: candidates.length,
      agreementsRemoved: removedCount
    }
  }
}
