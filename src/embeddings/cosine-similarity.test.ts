import { describe, expect, it } from 'vitest'
import { cosineSimilarity, findTopK } from './cosine-similarity.js'

describe('Cosine Similarity', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([1, 0, 0])

      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
    })

    it('returns 0 for orthogonal vectors', () => {
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([0, 1, 0])

      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
    })

    it('returns -1 for opposite vectors', () => {
      const a = new Float32Array([1, 0, 0])
      const b = new Float32Array([-1, 0, 0])

      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
    })

    it('handles normalized vectors', () => {
      // Both vectors normalized (length 1)
      const a = new Float32Array([0.6, 0.8, 0])
      const b = new Float32Array([0.8, 0.6, 0])

      const similarity = cosineSimilarity(a, b)

      // These vectors are similar but not identical
      expect(similarity).toBeGreaterThan(0.9)
      expect(similarity).toBeLessThan(1)
    })

    it('handles unnormalized vectors', () => {
      const a = new Float32Array([2, 4, 6])
      const b = new Float32Array([1, 2, 3])

      // These are parallel vectors (same direction), should be very similar
      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
    })

    it('handles high-dimensional vectors', () => {
      const dim = 1536 // OpenAI embedding dimension
      const a = new Float32Array(dim).fill(1 / Math.sqrt(dim))
      const b = new Float32Array(dim).fill(1 / Math.sqrt(dim))

      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5)
    })

    it('returns 0 for zero vectors', () => {
      const a = new Float32Array([0, 0, 0])
      const b = new Float32Array([1, 2, 3])

      const similarity = cosineSimilarity(a, b)

      // Zero vector has undefined angle, typically returns 0 or NaN
      expect(Number.isNaN(similarity) || similarity === 0).toBe(true)
    })
  })

  describe('findTopK', () => {
    it('returns top K most similar items', () => {
      const query = new Float32Array([1, 0, 0])
      const items = [
        { id: 1, embedding: new Float32Array([1, 0, 0]) }, // similarity: 1
        { id: 2, embedding: new Float32Array([0.9, 0.1, 0]) }, // high similarity
        { id: 3, embedding: new Float32Array([0, 1, 0]) }, // similarity: 0
        { id: 4, embedding: new Float32Array([0.8, 0.2, 0]) } // medium-high similarity
      ]

      const results = findTopK(query, items, 2)

      expect(results).toHaveLength(2)
      expect(results[0]?.id).toBe(1) // Most similar
      expect(results[0]?.similarity).toBeCloseTo(1)
    })

    it('returns all items if K > items.length', () => {
      const query = new Float32Array([1, 0])
      const items = [
        { id: 1, embedding: new Float32Array([1, 0]) },
        { id: 2, embedding: new Float32Array([0, 1]) }
      ]

      const results = findTopK(query, items, 10)

      expect(results).toHaveLength(2)
    })

    it('filters by minimum similarity', () => {
      const query = new Float32Array([1, 0, 0])
      const items = [
        { id: 1, embedding: new Float32Array([1, 0, 0]) }, // similarity: 1
        { id: 2, embedding: new Float32Array([0, 1, 0]) }, // similarity: 0
        { id: 3, embedding: new Float32Array([0, 0, 1]) } // similarity: 0
      ]

      const results = findTopK(query, items, 10, 0.5)

      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe(1)
    })

    it('sorts results by similarity descending', () => {
      const query = new Float32Array([1, 0, 0])
      const items = [
        { id: 1, embedding: new Float32Array([0.5, 0.5, 0]) },
        { id: 2, embedding: new Float32Array([0.9, 0.1, 0]) },
        { id: 3, embedding: new Float32Array([0.7, 0.3, 0]) }
      ]

      const results = findTopK(query, items, 3)

      expect(results[0]?.similarity).toBeGreaterThanOrEqual(results[1]?.similarity ?? 0)
      expect(results[1]?.similarity).toBeGreaterThanOrEqual(results[2]?.similarity ?? 0)
    })

    it('handles empty items array', () => {
      const query = new Float32Array([1, 0, 0])

      const results = findTopK(query, [], 5)

      expect(results).toHaveLength(0)
    })

    it('handles K = 0', () => {
      const query = new Float32Array([1, 0])
      const items = [{ id: 1, embedding: new Float32Array([1, 0]) }]

      const results = findTopK(query, items, 0)

      expect(results).toHaveLength(0)
    })

    it('includes ID and similarity in results', () => {
      const query = new Float32Array([1, 0])
      const items = [{ id: 42, embedding: new Float32Array([1, 0]) }]

      const results = findTopK(query, items, 1)

      expect(results[0]).toHaveProperty('id', 42)
      expect(results[0]).toHaveProperty('similarity')
      expect(typeof results[0]?.similarity).toBe('number')
    })
  })
})
