/**
 * Candidate Extraction Module
 *
 * Extract candidate messages likely to contain activities using:
 * - Heuristics (regex + URL patterns) - fast, free
 * - Embeddings (semantic search) - slower, requires OpenAI API
 */

import type {
  CandidateMessage,
  EmbeddingConfig,
  ExtractorOptions,
  ExtractorResult,
  ParsedMessage,
  ResponseCache,
  Result,
  SemanticSearchConfig
} from '../types.js'
import { extractCandidatesByEmbeddings } from './embeddings/index.js'
import { extractCandidatesByHeuristics } from './heuristics/index.js'

// Re-export embeddings
export {
  ACTIVITY_TYPE_QUERIES,
  AGREEMENT_QUERIES,
  cosineSimilarity,
  DEFAULT_ACTIVITY_QUERIES,
  embedMessages,
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
} from './embeddings/index.js'
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
} from './heuristics/index.js'

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
}

/**
 * Extract candidates using both heuristics and embeddings.
 *
 * When embeddings config is provided and OPENAI_API_KEY is available,
 * runs both extraction methods and merges results by messageId.
 * Falls back to heuristics-only when embeddings unavailable.
 */
export async function extractCandidates(
  messages: readonly ParsedMessage[],
  config?: ExtractCandidatesConfig
): Promise<Result<ExtractCandidatesResult>> {
  // Always run heuristics (fast, free)
  const heuristicsResult = extractCandidatesByHeuristics(messages, config?.heuristics)

  // If no embeddings config, return heuristics only
  if (!config?.embeddings) {
    return {
      ok: true,
      value: {
        ...heuristicsResult,
        embeddingsMatches: 0
      }
    }
  }

  // Run embeddings extraction
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

  const candidates = [...candidateMap.values()].sort((a, b) => b.confidence - a.confidence)

  return {
    ok: true,
    value: {
      candidates,
      regexMatches: heuristicsResult.regexMatches,
      urlMatches: heuristicsResult.urlMatches,
      embeddingsMatches: embeddingsResult.value.length,
      totalUnique: candidates.length
    }
  }
}
