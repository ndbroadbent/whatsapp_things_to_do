/**
 * Scraper Module Tests
 */

import { describe, expect, it } from 'vitest'
import { detectPlatform } from './index'

describe('detectPlatform', () => {
  it('detects TikTok URLs', () => {
    expect(detectPlatform('https://www.tiktok.com/@user/video/123')).toBe('tiktok')
    expect(detectPlatform('https://vt.tiktok.com/ZS6myoDYu/')).toBe('tiktok')
    expect(detectPlatform('https://m.tiktok.com/v/123')).toBe('tiktok')
  })

  it('detects Instagram URLs', () => {
    expect(detectPlatform('https://www.instagram.com/p/ABC123/')).toBe('instagram')
    expect(detectPlatform('https://instagram.com/reel/XYZ789/')).toBe('instagram')
    expect(detectPlatform('https://instagr.am/p/ABC123/')).toBe('instagram')
  })

  it('detects YouTube URLs', () => {
    expect(detectPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube')
    expect(detectPlatform('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')
    expect(detectPlatform('https://youtube-nocookie.com/embed/dQw4w9WgXcQ')).toBe('youtube')
  })

  it('detects X/Twitter URLs', () => {
    expect(detectPlatform('https://twitter.com/user/status/123')).toBe('x')
    expect(detectPlatform('https://x.com/user/status/123')).toBe('x')
    expect(detectPlatform('https://t.co/ABC123')).toBe('x')
  })

  it('detects Facebook URLs', () => {
    expect(detectPlatform('https://www.facebook.com/user/posts/123')).toBe('facebook')
    expect(detectPlatform('https://fb.watch/ABC123/')).toBe('facebook')
    expect(detectPlatform('https://fb.me/ABC123')).toBe('facebook')
  })

  it('detects Google Maps URLs', () => {
    expect(detectPlatform('https://maps.google.com/maps?q=test')).toBe('google_maps')
    expect(detectPlatform('https://goo.gl/maps/ABC123')).toBe('google_maps')
    expect(detectPlatform('https://maps.app.goo.gl/ABC123')).toBe('google_maps')
    expect(detectPlatform('https://www.google.com/maps/place/Test')).toBe('google_maps')
  })

  it('detects Reddit URLs', () => {
    expect(detectPlatform('https://www.reddit.com/r/test/comments/abc123/title/')).toBe('reddit')
    expect(detectPlatform('https://reddit.com/r/test')).toBe('reddit')
    expect(detectPlatform('https://redd.it/abc123')).toBe('reddit')
  })

  it('returns "other" for unknown URLs', () => {
    expect(detectPlatform('https://example.com')).toBe('other')
    expect(detectPlatform('https://linkedin.com/post/123')).toBe('other')
  })
})
