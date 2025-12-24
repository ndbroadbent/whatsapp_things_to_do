/**
 * URL Metadata Fetching Tests
 */

import { describe, expect, it } from 'vitest'
import type { CandidateMessage } from '../types'
import { extractUrlsFromCandidates, extractUrlsFromText } from './metadata'

describe('extractUrlsFromText', () => {
  it('extracts http URLs', () => {
    const text = 'Check out http://example.com for more info'
    expect(extractUrlsFromText(text)).toEqual(['http://example.com'])
  })

  it('extracts https URLs', () => {
    const text = 'Visit https://airbnb.com/rooms/123 for booking'
    expect(extractUrlsFromText(text)).toEqual(['https://airbnb.com/rooms/123'])
  })

  it('extracts multiple URLs', () => {
    const text = 'See https://a.com and https://b.com'
    expect(extractUrlsFromText(text)).toEqual(['https://a.com', 'https://b.com'])
  })

  it('deduplicates URLs', () => {
    const text = 'Visit https://a.com and https://a.com again'
    expect(extractUrlsFromText(text)).toEqual(['https://a.com'])
  })

  it('returns empty array for no URLs', () => {
    expect(extractUrlsFromText('No links here')).toEqual([])
  })

  it('handles complex URLs with paths and params', () => {
    const text = 'Check https://example.com/path/to/page?foo=bar&baz=qux#section'
    expect(extractUrlsFromText(text)).toEqual([
      'https://example.com/path/to/page?foo=bar&baz=qux#section'
    ])
  })
})

describe('extractUrlsFromCandidates', () => {
  const makeCandidate = (
    content: string,
    contextBefore: string[] = [],
    contextAfter: string[] = []
  ): CandidateMessage => ({
    messageId: 1,
    content,
    sender: 'Alice',
    timestamp: new Date(),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    candidateType: 'suggestion',
    contextBefore,
    contextAfter
  })

  it('extracts URLs from context before', () => {
    const candidates = [makeCandidate('hi', ['Check https://example.com'])]
    expect(extractUrlsFromCandidates(candidates)).toEqual(['https://example.com'])
  })

  it('extracts URLs from context after', () => {
    const candidates = [makeCandidate('hi', [], ['See https://example.com'])]
    expect(extractUrlsFromCandidates(candidates)).toEqual(['https://example.com'])
  })

  it('extracts URLs from content', () => {
    const candidates = [makeCandidate('Visit https://example.com')]
    expect(extractUrlsFromCandidates(candidates)).toEqual(['https://example.com'])
  })

  it('deduplicates across candidates', () => {
    const candidates = [
      makeCandidate('hi', ['Check https://a.com']),
      makeCandidate('hi', ['Also https://a.com and https://b.com'])
    ]
    expect(extractUrlsFromCandidates(candidates)).toEqual(['https://a.com', 'https://b.com'])
  })
})
