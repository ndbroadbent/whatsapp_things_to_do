/**
 * Embeddings Module
 *
 * Generate embeddings for semantic search to find "hidden gems" -
 * activity suggestions that don't match explicit patterns.
 */

import { generateEmbeddingCacheKey } from '../../cache/key.js'
import { DEFAULT_CACHE_TTL_SECONDS } from '../../cache/types.js'
import { handleHttpError, handleNetworkError, httpFetch } from '../../http.js'
import type {
  CandidateMessage,
  CandidateSource,
  EmbeddedMessage,
  EmbeddingConfig,
  ParsedMessage,
  QueryType,
  ResponseCache,
  Result,
  SemanticSearchConfig
} from '../../types.js'
import { findTopK } from './cosine-similarity.js'
import activityTypes from './queries/activity-types.json' with { type: 'json' }
import agreementQueries from './queries/agreement.json' with { type: 'json' }
import suggestionQueries from './queries/suggestions.json' with { type: 'json' }
import { getDefaultQueryEmbeddings } from './query-embeddings.js'

export { cosineSimilarity, findTopK } from './cosine-similarity.js'
export {
  getAllQueryEmbeddings,
  getDefaultQueryEmbeddings,
  getQueryEmbedding,
  getQueryEmbeddingsDimensions,
  getQueryEmbeddingsModel,
  loadQueryEmbeddings
} from './query-embeddings.js'

const DEFAULT_MODEL = 'text-embedding-3-large'
const DEFAULT_BATCH_SIZE = 100
const DEFAULT_CONCURRENCY = 10
const MAX_OPENAI_BATCH_SIZE = 2048
const DEFAULT_MIN_SIMILARITY = 0.4

/** Suggestion queries - phrases indicating direct intent to do something. */
export const SUGGESTION_QUERIES: readonly string[] = suggestionQueries

/** Agreement queries - phrases indicating interest/agreement with a suggestion. */
export const AGREEMENT_QUERIES: readonly string[] = agreementQueries

/** Activity type queries - short keywords for different activity categories. */
export const ACTIVITY_TYPE_QUERIES: readonly string[] = Object.values(activityTypes).flat()

/** All default activity queries for semantic search. */
export const DEFAULT_ACTIVITY_QUERIES: readonly string[] = [
  ...SUGGESTION_QUERIES,
  ...AGREEMENT_QUERIES,
  ...ACTIVITY_TYPE_QUERIES
]

/** Get the query type for a given query string. */
export function getQueryType(query: string): QueryType {
  if (AGREEMENT_QUERIES.includes(query)) {
    return 'agreement'
  }
  return 'suggestion'
}

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

interface BatchResult {
  embeddings: Float32Array[]
  cacheHit: boolean
}

/**
 * Embed a batch of texts using OpenAI API.
 */
async function embedBatch(
  texts: readonly string[],
  config: EmbeddingConfig,
  cache?: ResponseCache
): Promise<Result<BatchResult>> {
  const model = config.model ?? DEFAULT_MODEL

  // Check cache first (store as number[][] since Float32Array doesn't serialize well)
  const cacheKey = generateEmbeddingCacheKey(model, texts)
  if (cache) {
    const cached = await cache.get<number[][]>(cacheKey)
    if (cached) {
      return {
        ok: true,
        value: {
          embeddings: cached.data.map((arr) => new Float32Array(arr)),
          cacheHit: true
        }
      }
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

    return { ok: true, value: { embeddings, cacheHit: false } }
  } catch (error) {
    return handleNetworkError(error)
  }
}

interface BatchTask {
  batchIndex: number
  batch: readonly { id: number; content: string }[]
  texts: readonly string[]
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
  const concurrency = config.concurrency ?? DEFAULT_CONCURRENCY
  const totalBatches = Math.ceil(messages.length / batchSize)

  // Build all batch tasks
  const tasks: BatchTask[] = []
  for (let i = 0; i < messages.length; i += batchSize) {
    const batchIndex = Math.floor(i / batchSize)
    const batch = messages.slice(i, i + batchSize)
    tasks.push({
      batchIndex,
      batch,
      texts: batch.map((m) => m.content)
    })
  }

  // Results array indexed by batchIndex
  const batchResults: (EmbeddedMessage[] | null)[] = new Array(tasks.length).fill(null)
  let firstError: Result<never> | null = null

  // Process batches with concurrency limit
  const processBatch = async (task: BatchTask): Promise<void> => {
    if (firstError) return // Stop if we already hit an error

    const progressInfo = {
      phase: 'messages' as const,
      batchIndex: task.batchIndex,
      totalBatches,
      itemsInBatch: task.batch.length,
      totalItems: messages.length,
      cacheHit: false
    }

    config.onBatchStart?.(progressInfo)

    const startTime = Date.now()
    const embedResult = await embedBatch(task.texts, config, cache)

    if (!embedResult.ok) {
      firstError = embedResult
      return
    }

    config.onBatchComplete?.({
      ...progressInfo,
      cacheHit: embedResult.value.cacheHit,
      durationMs: Date.now() - startTime
    })

    const batchEmbeddings: EmbeddedMessage[] = []
    for (let j = 0; j < task.batch.length; j++) {
      const msg = task.batch[j]
      const embedding = embedResult.value.embeddings[j]
      if (msg && embedding) {
        batchEmbeddings.push({
          messageId: msg.id,
          content: msg.content,
          embedding
        })
      }
    }
    batchResults[task.batchIndex] = batchEmbeddings
  }

  // Process in chunks of `concurrency` size
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency)
    await Promise.all(chunk.map(processBatch))
    if (firstError) return firstError
  }

  // Flatten results in order
  const results: EmbeddedMessage[] = []
  for (const batch of batchResults) {
    if (batch) results.push(...batch)
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
  const result = await embedBatch(queries, config, cache)
  if (!result.ok) return result
  return { ok: true, value: result.value.embeddings }
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
  const minSimilarity = config?.minSimilarity ?? DEFAULT_MIN_SIMILARITY
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
      query,
      queryType: getQueryType(query)
    }

    candidates.push({
      messageId,
      content: msg.content,
      sender: msg.sender,
      timestamp: msg.timestamp,
      source,
      confidence: similarity,
      urls: msg.urls
    })
  }

  // Sort by confidence descending
  return candidates.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Extract candidates using semantic search (embeddings).
 *
 * Embeds all messages and queries, then finds semantically similar messages.
 * Requires OpenAI API key for embeddings.
 *
 * IMPORTANT: Query embeddings are PRE-COMPUTED and loaded from query-embeddings.json.gz.
 * Do NOT call embedQueries() for the default queries - use getDefaultQueryEmbeddings().
 * To update query embeddings, run: bun scripts/generate-query-embeddings.ts
 *
 * @param messages Parsed messages to search
 * @param embeddingConfig Embedding configuration
 * @param searchConfig Search configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @returns Semantic candidates or error
 */
export async function extractCandidatesByEmbeddings(
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

  // Use pre-computed query embeddings (generated by scripts/generate-query-embeddings.ts)
  const queryEmbeddings = getDefaultQueryEmbeddings()

  // Find semantic candidates
  const candidates = findSemanticCandidates(
    messageEmbeddingsResult.value,
    queryEmbeddings,
    messages,
    searchConfig
  )

  return { ok: true, value: candidates }
}
