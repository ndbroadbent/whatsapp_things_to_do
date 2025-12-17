/**
 * Embeddings Module
 *
 * Generate embeddings for semantic search to find "hidden gems".
 */

import type {
  CandidateMessage,
  EmbeddedMessage,
  EmbeddingConfig,
  SemanticSearchConfig
} from '../types.js'

/**
 * Embed a batch of messages using OpenAI text-embedding-3-small.
 */
export async function embedMessages(
  messages: { id: number; content: string }[],
  _config: EmbeddingConfig
): Promise<EmbeddedMessage[]> {
  // TODO: Implement embeddings
  // See src/embeddings.py in Python prototype for reference
  throw new Error(`Not implemented. Message count: ${messages.length}`)
}

/**
 * Find semantically similar messages to activity-related queries.
 */
export function findSemanticCandidates(
  embeddings: EmbeddedMessage[],
  _config: SemanticSearchConfig
): CandidateMessage[] {
  // TODO: Implement semantic search
  throw new Error(`Not implemented. Embedding count: ${embeddings.length}`)
}

/**
 * Calculate cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding dimensions must match: ${a.length} vs ${b.length}`)
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const aVal = a[i] ?? 0
    const bVal = b[i] ?? 0
    dotProduct += aVal * bVal
    normA += aVal * aVal
    normB += bVal * bVal
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  if (magnitude === 0) return 0

  return dotProduct / magnitude
}
