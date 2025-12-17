import { describe, expect, it } from 'vitest'
import { cosineSimilarity } from './index.js'

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0)
  })

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0, 1])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0)
  })

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([-1, -2, -3])
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0)
  })

  it('returns 0 for zero vector', () => {
    const a = new Float32Array([0, 0, 0])
    const b = new Float32Array([1, 2, 3])
    expect(cosineSimilarity(a, b)).toBe(0)
  })

  it('throws for mismatched dimensions', () => {
    const a = new Float32Array([1, 2, 3])
    const b = new Float32Array([1, 2])
    expect(() => cosineSimilarity(a, b)).toThrow('dimensions must match')
  })

  it('handles normalized vectors correctly', () => {
    // Unit vectors at 60 degrees apart: cos(60°) = 0.5
    const a = new Float32Array([1, 0])
    const b = new Float32Array([0.5, Math.sqrt(3) / 2])
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.5)
  })
})
