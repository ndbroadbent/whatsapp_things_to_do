/**
 * Embeddings Module
 *
 * Generate embeddings for semantic search to find "hidden gems" -
 * activity suggestions that don't match explicit patterns.
 */

import { generateEmbeddingCacheKey } from '../cache/key.js'
import { DEFAULT_CACHE_TTL_SECONDS } from '../cache/types.js'
import { handleHttpError, handleNetworkError, httpFetch } from '../http.js'
import type {
  CandidateMessage,
  CandidateSource,
  EmbeddedMessage,
  EmbeddingConfig,
  ParsedMessage,
  ResponseCache,
  Result,
  SemanticSearchConfig
} from '../types.js'
import { findTopK } from './cosine-similarity.js'

export { cosineSimilarity, findTopK } from './cosine-similarity.js'

const DEFAULT_MODEL = 'text-embedding-3-small'
const DEFAULT_BATCH_SIZE = 100
const MAX_OPENAI_BATCH_SIZE = 2048

/**
 * Default activity queries for semantic search.
 * These are embedded and used to find similar messages.
 */
export const DEFAULT_ACTIVITY_QUERIES: readonly string[] = [
  // Direct suggestions
  'we should go visit this place together',
  "let's try this activity sometime",
  'I want to go there with you',
  'this looks like a fun thing to do',
  'bucket list destination we should visit',
  // Activity types
  'hiking trail walk nature reserve',
  'restaurant cafe bar food dining',
  'beach swimming kayaking water activities',
  'concert show festival event tickets',
  'hotel airbnb accommodation travel trip'
]

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

/**
 * Embed a batch of texts using OpenAI API.
 */
async function embedBatch(
  texts: readonly string[],
  config: EmbeddingConfig,
  cache?: ResponseCache
): Promise<Result<Float32Array[]>> {
  const model = config.model ?? DEFAULT_MODEL

  // Check cache first (store as number[][] since Float32Array doesn't serialize well)
  const cacheKey = generateEmbeddingCacheKey(model, texts)
  if (cache) {
    const cached = await cache.get<number[][]>(cacheKey)
    if (cached) {
      return { ok: true, value: cached.data.map((arr) => new Float32Array(arr)) }
    }
  }

  try {
    const response = await httpFetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model,
        input: texts
      })
    })

    if (!response.ok) {
      return handleHttpError(response)
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse

    // Convert to Float32Arrays, ordered by index
    const embeddings: Float32Array[] = new Array(texts.length)
    for (const item of data.data) {
      embeddings[item.index] = new Float32Array(item.embedding)
    }

    // Cache the results (convert to number[][] for JSON serialization)
    if (cache) {
      const serializable = embeddings.map((e) => Array.from(e))
      await cache.set(
        cacheKey,
        { data: serializable, cachedAt: Date.now() },
        DEFAULT_CACHE_TTL_SECONDS
      )
    }

    return { ok: true, value: embeddings }
  } catch (error) {
    return handleNetworkError(error)
  }
}

/**
 * Embed messages for semantic search.
 *
 * @param messages Messages to embed (id and content required)
 * @param config OpenAI API configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @returns Array of embedded messages
 */
export async function embedMessages(
  messages: readonly { id: number; content: string }[],
  config: EmbeddingConfig,
  cache?: ResponseCache
): Promise<Result<EmbeddedMessage[]>> {
  const batchSize = Math.min(config.batchSize ?? DEFAULT_BATCH_SIZE, MAX_OPENAI_BATCH_SIZE)

  const results: EmbeddedMessage[] = []

  // Process in batches
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize)
    const texts = batch.map((m) => m.content)

    const embedResult = await embedBatch(texts, config, cache)

    if (!embedResult.ok) {
      return embedResult
    }

    for (let j = 0; j < batch.length; j++) {
      const msg = batch[j]
      const embedding = embedResult.value[j]
      if (msg && embedding) {
        results.push({
          messageId: msg.id,
          content: msg.content,
          embedding
        })
      }
    }
  }

  return { ok: true, value: results }
}

/**
 * Embed query strings for semantic search.
 */
export async function embedQueries(
  queries: readonly string[],
  config: EmbeddingConfig,
  cache?: ResponseCache
): Promise<Result<Float32Array[]>> {
  return embedBatch(queries, config, cache)
}

/**
 * Find semantically similar messages using embedded queries.
 *
 * @param embeddings Pre-computed message embeddings
 * @param queryEmbeddings Embedded query vectors
 * @param config Search configuration
 * @returns Candidate messages found via semantic similarity
 */
export function findSemanticCandidates(
  embeddings: readonly EmbeddedMessage[],
  queryEmbeddings: readonly Float32Array[],
  messages: readonly ParsedMessage[],
  config?: SemanticSearchConfig
): CandidateMessage[] {
  const topK = config?.topK ?? 500
  const minSimilarity = config?.minSimilarity ?? 0.25
  const queries = config?.queries ?? DEFAULT_ACTIVITY_QUERIES

  // Build a map from messageId to message for quick lookup
  const messageMap = new Map<number, ParsedMessage>()
  for (const msg of messages) {
    messageMap.set(msg.id, msg)
  }

  // Build candidates for each query embedding and merge
  const candidateMap = new Map<number, { similarity: number; query: string }>()

  for (let i = 0; i < queryEmbeddings.length; i++) {
    const queryEmbedding = queryEmbeddings[i]
    const queryText = queries[i] ?? `query_${i}`

    if (!queryEmbedding) continue

    const topMatches = findTopK(
      queryEmbedding,
      embeddings.map((e) => ({ id: e.messageId, embedding: e.embedding })),
      topK,
      minSimilarity
    )

    for (const match of topMatches) {
      const existing = candidateMap.get(match.id)
      if (!existing || match.similarity > existing.similarity) {
        candidateMap.set(match.id, { similarity: match.similarity, query: queryText })
      }
    }
  }

  // Convert to CandidateMessage array
  const candidates: CandidateMessage[] = []

  for (const [messageId, { similarity, query }] of candidateMap) {
    const msg = messageMap.get(messageId)
    if (!msg) continue

    const source: CandidateSource = {
      type: 'semantic',
      similarity,
      query
    }

    candidates.push({
      messageId,
      content: msg.content,
      sender: msg.sender,
      timestamp: msg.timestamp,
      source,
      confidence: similarity, // Use similarity as confidence
      urls: msg.urls
    })
  }

  // Sort by confidence descending
  return candidates.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Full semantic search pipeline: embed messages, embed queries, find candidates.
 *
 * @param messages Parsed messages to search
 * @param embeddingConfig Embedding configuration
 * @param searchConfig Search configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @returns Semantic candidates or error
 */
export async function semanticSearch(
  messages: readonly ParsedMessage[],
  embeddingConfig: EmbeddingConfig,
  searchConfig?: SemanticSearchConfig,
  cache?: ResponseCache
): Promise<Result<CandidateMessage[]>> {
  // Filter messages with content
  const messagesToEmbed = messages
    .filter((m) => m.content.length > 10) // Skip very short messages
    .map((m) => ({ id: m.id, content: m.content }))

  // Embed all messages
  const messageEmbeddingsResult = await embedMessages(messagesToEmbed, embeddingConfig, cache)
  if (!messageEmbeddingsResult.ok) {
    return messageEmbeddingsResult
  }

  // Embed query strings
  const queries = searchConfig?.queries ?? DEFAULT_ACTIVITY_QUERIES
  const queryEmbeddingsResult = await embedQueries(queries, embeddingConfig, cache)
  if (!queryEmbeddingsResult.ok) {
    return queryEmbeddingsResult
  }

  // Find semantic candidates
  const candidates = findSemanticCandidates(
    messageEmbeddingsResult.value,
    queryEmbeddingsResult.value,
    messages,
    searchConfig
  )

  return { ok: true, value: candidates }
}
