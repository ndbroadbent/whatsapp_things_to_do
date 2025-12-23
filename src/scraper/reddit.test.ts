/**
 * Reddit Scraper Tests
 */

import { describe, expect, it } from 'vitest'
import { extractRedditPostId, isRedditUrl } from './reddit'

describe('isRedditUrl', () => {
  it('matches reddit.com URLs', () => {
    expect(isRedditUrl('https://www.reddit.com/r/test/comments/abc123/title/')).toBe(true)
    expect(isRedditUrl('https://reddit.com/r/test/comments/abc123/title/')).toBe(true)
  })

  it('matches redd.it short URLs', () => {
    expect(isRedditUrl('https://redd.it/abc123')).toBe(true)
  })

  it('matches share URLs', () => {
    expect(isRedditUrl('https://www.reddit.com/r/oddlysatisfying/s/6jHbC0UQEi')).toBe(true)
  })

  it('rejects non-Reddit URLs', () => {
    expect(isRedditUrl('https://example.com')).toBe(false)
    expect(isRedditUrl('https://youtube.com/watch?v=abc')).toBe(false)
  })
})

describe('extractRedditPostId', () => {
  it('extracts post ID from full URL', () => {
    expect(
      extractRedditPostId('https://www.reddit.com/r/oddlysatisfying/comments/1amvnvg/title/')
    ).toBe('1amvnvg')
  })

  it('extracts post ID with query params', () => {
    expect(
      extractRedditPostId(
        'https://www.reddit.com/r/test/comments/abc123/title/?share_id=xyz&utm_source=share'
      )
    ).toBe('abc123')
  })

  it('returns null for URLs without post ID', () => {
    expect(extractRedditPostId('https://www.reddit.com/r/oddlysatisfying/')).toBe(null)
    expect(extractRedditPostId('https://www.reddit.com/r/oddlysatisfying/s/abc123')).toBe(null)
  })
})
