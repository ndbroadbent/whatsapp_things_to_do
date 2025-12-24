/**
 * Embeddings Module
 *
 * Generate embeddings for semantic search to find "hidden gems" -
 * activity suggestions that don't match explicit patterns.
 */

import { generateEmbeddingCacheKey } from '../../cache/key'
import type { ResponseCache } from '../../cache/types'
import { handleHttpError, handleNetworkError, httpFetch } from '../../http'
import type {
  CandidateMessage,
  CandidateSource,
  EmbeddedMessage,
  EmbeddingConfig,
  ParsedMessage,
  QueryType,
  Result,
  SemanticSearchConfig
} from '../../types'
import { getMessageContext } from '../context-window'
import { findTopK } from './cosine-similarity'
import activityTypes from './queries/activity-types.json' with { type: 'json' }
import agreementQueries from './queries/agreement.json' with { type: 'json' }
import suggestionQueries from './queries/suggestions.json' with { type: 'json' }
import { getDefaultQueryEmbeddings } from './query-embeddings'

export { cosineSimilarity, findTopK } from './cosine-similarity'
export {
  getAllQueryEmbeddings,
  getDefaultQueryEmbeddings,
  getQueryEmbedding,
  getQueryEmbeddingsDimensions,
  getQueryEmbeddingsModel,
  loadQueryEmbeddings
} from './query-embeddings'

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
      await cache.set(cacheKey, { data: serializable, cachedAt: Date.now() })
    }

    return { ok: true, value: { embeddings, cacheHit: false } }
  } catch (error) {
    return handleNetworkError(error)
  }
}

/**
 * Batch progress info passed to callbacks.
 */
interface EmbeddingBatchInfo {
  batchIndex: number
  totalBatches: number
  itemsInBatch: number
  totalItems: number
  cacheHit: boolean
  durationMs: number
}

/**
 * Callback for each batch of embeddings.
 */
type EmbeddingBatchCallback = (
  embeddings: readonly EmbeddedMessage[],
  info: EmbeddingBatchInfo
) => void

/**
 * Options for messageEmbeddings.
 */
interface MessageEmbeddingsOptions {
  /** Called with each batch of embeddings as they become available */
  onBatch?: EmbeddingBatchCallback
  /** Batch size for API calls (default 100, max 2048) */
  batchSize?: number
  /** Max concurrent API calls (default 10) */
  concurrency?: number
}

/**
 * Stream message embeddings batch by batch.
 *
 * Embeddings are cached to the API cache. Each batch is passed to the onBatch
 * callback as soon as it's ready - nothing is accumulated in memory.
 *
 * @param messages Messages to embed (id and content required)
 * @param config OpenAI API configuration
 * @param cache Optional response cache to prevent duplicate API calls
 * @param options Streaming options including onBatch callback
 * @returns Success/failure result (embeddings are delivered via callback)
 */
export async function messageEmbeddings(
  messages: readonly { id: number; content: string }[],
  config: EmbeddingConfig,
  cache?: ResponseCache,
  options?: MessageEmbeddingsOptions
): Promise<Result<{ totalEmbedded: number; cachedBatches: number }>> {
  const batchSize = Math.min(options?.batchSize ?? DEFAULT_BATCH_SIZE, MAX_OPENAI_BATCH_SIZE)
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY
  const totalBatches = Math.ceil(messages.length / batchSize)

  let totalEmbedded = 0
  let cachedBatches = 0
  let firstError: Result<never> | null = null

  // Process batches with concurrency limit
  for (let i = 0; i < messages.length && !firstError; i += batchSize * concurrency) {
    const chunkTasks: Promise<void>[] = []

    for (let j = 0; j < concurrency && i + j * batchSize < messages.length; j++) {
      const batchStart = i + j * batchSize
      const batchIndex = Math.floor(batchStart / batchSize)
      const batch = messages.slice(batchStart, batchStart + batchSize)
      const texts = batch.map((m) => m.content)

      chunkTasks.push(
        (async () => {
          if (firstError) return

          const startTime = Date.now()
          const embedResult = await embedBatch(texts, config, cache)

          if (!embedResult.ok) {
            firstError = embedResult
            return
          }

          const info: EmbeddingBatchInfo = {
            batchIndex,
            totalBatches,
            itemsInBatch: batch.length,
            totalItems: messages.length,
            cacheHit: embedResult.value.cacheHit,
            durationMs: Date.now() - startTime
          }

          if (embedResult.value.cacheHit) {
            cachedBatches++
          }

          // Build embeddings for this batch
          const batchEmbeddings: EmbeddedMessage[] = []
          for (let k = 0; k < batch.length; k++) {
            const msg = batch[k]
            const embedding = embedResult.value.embeddings[k]
            if (msg && embedding) {
              batchEmbeddings.push({
                messageId: msg.id,
                content: msg.content,
                embedding
              })
            }
          }

          totalEmbedded += batchEmbeddings.length

          // Deliver to callback (if provided)
          options?.onBatch?.(batchEmbeddings, info)
        })()
      )
    }

    await Promise.all(chunkTasks)
  }

  if (firstError) return firstError

  return { ok: true, value: { totalEmbedded, cachedBatches } }
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

  // Build maps from messageId to message and index for quick lookup
  const messageMap = new Map<number, ParsedMessage>()
  const indexMap = new Map<number, number>()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg) {
      messageMap.set(msg.id, msg)
      indexMap.set(msg.id, i)
    }
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
    const index = indexMap.get(messageId)
    if (!msg || index === undefined) continue

    const source: CandidateSource = {
      type: 'semantic',
      similarity,
      query,
      queryType: getQueryType(query)
    }

    const ctx = getMessageContext(messages, index)

    candidates.push({
      messageId,
      content: msg.content,
      sender: msg.sender,
      timestamp: msg.timestamp,
      source,
      confidence: similarity,
      candidateType: getQueryType(query),
      contextBefore: ctx.before,
      contextAfter: ctx.after,
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
  cache?: ResponseCache,
  options?: MessageEmbeddingsOptions
): Promise<Result<CandidateMessage[]>> {
  // Filter messages with content
  const messagesToEmbed = messages
    .filter((m) => m.content.length > 10) // Skip very short messages
    .map((m) => ({ id: m.id, content: m.content }))

  // Embed all messages, accumulating results for semantic search
  const allEmbeddings: EmbeddedMessage[] = []
  const result = await messageEmbeddings(messagesToEmbed, embeddingConfig, cache, {
    ...options,
    onBatch: (embeddings, info) => {
      allEmbeddings.push(...embeddings)
      options?.onBatch?.(embeddings, info)
    }
  })

  if (!result.ok) {
    return result
  }

  // Use pre-computed query embeddings (generated by scripts/generate-query-embeddings.ts)
  const queryEmbeddings = getDefaultQueryEmbeddings()

  // Find semantic candidates
  const candidates = findSemanticCandidates(allEmbeddings, queryEmbeddings, messages, searchConfig)

  return { ok: true, value: candidates }
}
