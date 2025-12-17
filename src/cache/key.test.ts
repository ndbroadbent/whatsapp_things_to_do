import { describe, expect, it } from 'vitest'
import {
  generateCacheKey,
  generateClassifierCacheKey,
  generateEmbeddingCacheKey,
  generateGeocodeCacheKey
} from './key'

describe('generateCacheKey', () => {
  it('should generate consistent hash for same inputs', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'text-embedding-3-small',
      payload: { input: 'hello' }
    })
    const key2 = generateCacheKey({
      service: 'openai',
      model: 'text-embedding-3-small',
      payload: { input: 'hello' }
    })
    expect(key1).toBe(key2)
  })

  it('should generate different hash for different inputs', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'text-embedding-3-small',
      payload: { input: 'hello' }
    })
    const key2 = generateCacheKey({
      service: 'openai',
      model: 'text-embedding-3-small',
      payload: { input: 'world' }
    })
    expect(key1).not.toBe(key2)
  })

  it('should generate 64 character hex string', () => {
    const key = generateCacheKey({
      service: 'test',
      model: 'test',
      payload: {}
    })
    expect(key).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should normalize object key order for consistent hashing', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'gpt-4',
      payload: { a: 1, b: 2, c: 3 }
    })
    const key2 = generateCacheKey({
      service: 'openai',
      model: 'gpt-4',
      payload: { c: 3, a: 1, b: 2 }
    })
    expect(key1).toBe(key2)
  })

  it('should handle nested objects with consistent key order', () => {
    const key1 = generateCacheKey({
      service: 'anthropic',
      model: 'claude-3-haiku',
      payload: { outer: { inner: { z: 1, a: 2 } } }
    })
    const key2 = generateCacheKey({
      service: 'anthropic',
      model: 'claude-3-haiku',
      payload: { outer: { inner: { a: 2, z: 1 } } }
    })
    expect(key1).toBe(key2)
  })

  it('should handle arrays in payload', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'text-embedding-3-small',
      payload: { inputs: ['a', 'b', 'c'] }
    })
    const key2 = generateCacheKey({
      service: 'openai',
      model: 'text-embedding-3-small',
      payload: { inputs: ['a', 'b', 'c'] }
    })
    expect(key1).toBe(key2)
  })

  it('should produce different hash for different array order', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'test',
      payload: { inputs: ['a', 'b'] }
    })
    const key2 = generateCacheKey({
      service: 'openai',
      model: 'test',
      payload: { inputs: ['b', 'a'] }
    })
    expect(key1).not.toBe(key2)
  })

  it('should differentiate by service', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'test',
      payload: {}
    })
    const key2 = generateCacheKey({
      service: 'anthropic',
      model: 'test',
      payload: {}
    })
    expect(key1).not.toBe(key2)
  })

  it('should differentiate by model', () => {
    const key1 = generateCacheKey({
      service: 'openai',
      model: 'gpt-4',
      payload: {}
    })
    const key2 = generateCacheKey({
      service: 'openai',
      model: 'gpt-3.5-turbo',
      payload: {}
    })
    expect(key1).not.toBe(key2)
  })

  it('should handle null values in payload', () => {
    const key = generateCacheKey({
      service: 'test',
      model: 'test',
      payload: { value: null }
    })
    expect(key).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle empty payload', () => {
    const key = generateCacheKey({
      service: 'test',
      model: 'test',
      payload: {}
    })
    expect(key).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('generateEmbeddingCacheKey', () => {
  it('should generate consistent key for same inputs', () => {
    const key1 = generateEmbeddingCacheKey('text-embedding-3-small', ['hello', 'world'])
    const key2 = generateEmbeddingCacheKey('text-embedding-3-small', ['hello', 'world'])
    expect(key1).toBe(key2)
  })

  it('should sort inputs for consistent hashing', () => {
    const key1 = generateEmbeddingCacheKey('text-embedding-3-small', ['world', 'hello'])
    const key2 = generateEmbeddingCacheKey('text-embedding-3-small', ['hello', 'world'])
    expect(key1).toBe(key2)
  })

  it('should differentiate by model', () => {
    const key1 = generateEmbeddingCacheKey('text-embedding-3-small', ['hello'])
    const key2 = generateEmbeddingCacheKey('text-embedding-3-large', ['hello'])
    expect(key1).not.toBe(key2)
  })
})

describe('generateClassifierCacheKey', () => {
  it('should generate consistent key for same messages', () => {
    const messages = [
      { messageId: 1, content: 'Hello' },
      { messageId: 2, content: 'World' }
    ]
    const key1 = generateClassifierCacheKey('anthropic', 'claude-3-haiku', messages)
    const key2 = generateClassifierCacheKey('anthropic', 'claude-3-haiku', messages)
    expect(key1).toBe(key2)
  })

  it('should differentiate by provider', () => {
    const messages = [{ messageId: 1, content: 'Hello' }]
    const key1 = generateClassifierCacheKey('anthropic', 'claude-3-haiku', messages)
    const key2 = generateClassifierCacheKey('openai', 'gpt-4o-mini', messages)
    expect(key1).not.toBe(key2)
  })

  it('should differentiate by model', () => {
    const messages = [{ messageId: 1, content: 'Hello' }]
    const key1 = generateClassifierCacheKey('anthropic', 'claude-3-haiku', messages)
    const key2 = generateClassifierCacheKey('anthropic', 'claude-3-sonnet', messages)
    expect(key1).not.toBe(key2)
  })

  it('should handle empty messages array', () => {
    const key = generateClassifierCacheKey('anthropic', 'claude-3-haiku', [])
    expect(key).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('generateGeocodeCacheKey', () => {
  it('should generate consistent key for same location', () => {
    const key1 = generateGeocodeCacheKey('Auckland, New Zealand')
    const key2 = generateGeocodeCacheKey('Auckland, New Zealand')
    expect(key1).toBe(key2)
  })

  it('should differentiate by location', () => {
    const key1 = generateGeocodeCacheKey('Auckland, New Zealand')
    const key2 = generateGeocodeCacheKey('Wellington, New Zealand')
    expect(key1).not.toBe(key2)
  })

  it('should include region bias in key', () => {
    const key1 = generateGeocodeCacheKey('Auckland', 'nz')
    const key2 = generateGeocodeCacheKey('Auckland', 'au')
    expect(key1).not.toBe(key2)
  })

  it('should handle undefined region bias', () => {
    const key1 = generateGeocodeCacheKey('Auckland')
    const key2 = generateGeocodeCacheKey('Auckland', undefined)
    expect(key1).toBe(key2)
  })
})
