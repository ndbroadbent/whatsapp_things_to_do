/**
 * Cosine Similarity
 *
 * Pure function for comparing embedding vectors.
 */

/**
 * Calculate cosine similarity between two embedding vectors.
 *
 * @param a First embedding vector
 * @param b Second embedding vector
 * @returns Similarity score between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
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

  if (magnitude === 0) {
    return 0
  }

  return dotProduct / magnitude
}

/**
 * Find top-K most similar items to a query vector.
 *
 * @param query Query embedding vector
 * @param candidates Array of candidate embeddings with IDs
 * @param topK Number of results to return
 * @param minSimilarity Minimum similarity threshold
 * @returns Array of {id, similarity} sorted by similarity descending
 */
export function findTopK<T extends { id: number; embedding: Float32Array }>(
  query: Float32Array,
  candidates: readonly T[],
  topK: number,
  minSimilarity = 0
): Array<{ id: number; similarity: number }> {
  const results: Array<{ id: number; similarity: number }> = []

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(query, candidate.embedding)
    if (similarity >= minSimilarity) {
      results.push({ id: candidate.id, similarity })
    }
  }

  // Sort by similarity descending and take top K
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK)
}
