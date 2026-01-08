/**
 * Tests using real-world fixture files
 *
 * These tests verify the parser and extractor against realistic chat patterns
 * including various formats, URLs, edge cases, and exclusion patterns.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractCandidatesByHeuristics } from './extraction/heuristics/index'
import { parseWhatsAppChat } from './parser/whatsapp'

const FIXTURES_DIR = join(__dirname, '..', 'tests', 'fixtures')

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), 'utf-8')
}

describe('iOS Format Fixtures', () => {
  const content = loadFixture('ios-activities.txt')
  const messages = parseWhatsAppChat(content, { format: 'ios' })

  it('parses all messages', () => {
    expect(messages.length).toBeGreaterThan(25)
  })

  it('extracts correct senders', () => {
    const senders = new Set(messages.map((m) => m.sender))
    expect(senders).toContain('Sarah')
    expect(senders).toContain('Mike')
  })

  it('parses timestamps correctly', () => {
    const first = messages[0]
    expect(first?.timestamp.getFullYear()).toBe(2024)
    expect(first?.timestamp.getMonth()).toBe(2) // March (0-indexed)
    expect(first?.timestamp.getDate()).toBe(15)
  })

  it('extracts activity candidates', () => {
    const result = extractCandidatesByHeuristics(messages)
    expect(result.candidates.length).toBeGreaterThan(0)

    // Should find "we should try" pattern
    const weShould = result.candidates.find((c) => c.content.toLowerCase().includes('we should'))
    expect(weShould).toBeDefined()
    expect(weShould?.source.type).toBe('regex')
  })

  it('finds high-confidence patterns', () => {
    const result = extractCandidatesByHeuristics(messages)

    // "bucket list" is high confidence (0.95)
    const bucketList = result.candidates.find((c) =>
      c.content.toLowerCase().includes('bucket list')
    )
    expect(bucketList).toBeDefined()
    expect(bucketList?.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('finds medium-confidence patterns', () => {
    const result = extractCandidatesByHeuristics(messages)

    // "we could go" is medium confidence
    const weCould = result.candidates.find((c) => c.content.toLowerCase().includes('we could'))
    expect(weCould).toBeDefined()
    expect(weCould?.confidence).toBeGreaterThan(0.6)
  })
})

describe('Android Format Fixtures', () => {
  const content = loadFixture('android-activities.txt')
  const messages = parseWhatsAppChat(content, { format: 'android' })

  it('parses all messages', () => {
    expect(messages.length).toBeGreaterThan(20)
  })

  it('extracts correct senders', () => {
    const senders = new Set(messages.map((m) => m.sender))
    expect(senders).toContain('Emma')
    expect(senders).toContain('James')
    expect(senders).toContain('Sophie')
  })

  it('parses Android timestamp format', () => {
    const first = messages[0]
    expect(first?.timestamp.getFullYear()).toBe(2024)
    expect(first?.timestamp.getMonth()).toBe(2) // March
    expect(first?.timestamp.getDate()).toBe(20)
  })

  it('extracts activity candidates', () => {
    const result = extractCandidatesByHeuristics(messages)
    expect(result.candidates.length).toBeGreaterThan(0)

    // Should find "must visit" pattern
    const mustVisit = result.candidates.find((c) => c.content.toLowerCase().includes('must visit'))
    expect(mustVisit).toBeDefined()
  })

  it('finds multiple activity keywords', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Activities mentioned: bungy, jet boat, hiking, wine bar, cruise, caves, skiing
    const activities = result.candidates.filter(
      (c) =>
        c.content.toLowerCase().includes('bungy') ||
        c.content.toLowerCase().includes('jet boat') ||
        c.content.toLowerCase().includes('hik') ||
        c.content.toLowerCase().includes('wine') ||
        c.content.toLowerCase().includes('cruise') ||
        c.content.toLowerCase().includes('caves') ||
        c.content.toLowerCase().includes('ski')
    )
    expect(activities.length).toBeGreaterThan(3)
  })
})

describe('URL Fixtures', () => {
  const content = loadFixture('urls-and-links.txt')
  const messages = parseWhatsAppChat(content, { format: 'ios' })

  it('parses all messages', () => {
    expect(messages.length).toBeGreaterThan(25)
  })

  it('extracts Google Maps URLs', () => {
    const withMaps = messages.filter((m) =>
      m.urls?.some((u) => u.includes('maps.google.com') || u.includes('goo.gl/maps'))
    )
    expect(withMaps.length).toBeGreaterThanOrEqual(2)
  })

  it('extracts social media URLs', () => {
    const socialPlatforms = ['tiktok.com', 'instagram.com', 'youtube.com', 'x.com', 'facebook.com']

    for (const platform of socialPlatforms) {
      const found = messages.some((m) => m.urls?.some((u) => u.includes(platform)))
      expect(found).toBe(true)
    }
  })

  it('extracts travel site URLs', () => {
    const travelSites = ['airbnb.com', 'booking.com', 'tripadvisor.com', 'eventbrite.com']

    for (const site of travelSites) {
      const found = messages.some((m) => m.urls?.some((u) => u.includes(site)))
      expect(found).toBe(true)
    }
  })

  it('extracts URL-based candidates', () => {
    const result = extractCandidatesByHeuristics(messages, {
      includeUrlBased: true
    })

    // Should have URL-type candidates
    const urlCandidates = result.candidates.filter((c) => c.source.type === 'url')
    expect(urlCandidates.length).toBeGreaterThan(0)
    expect(result.urlMatches).toBeGreaterThan(0)
  })
})

describe('Edge Cases Fixtures', () => {
  const content = loadFixture('edge-cases.txt')
  const messages = parseWhatsAppChat(content, { format: 'ios' })

  it('skips system messages', () => {
    const systemPhrases = [
      'end-to-end encrypted',
      'security code',
      'created group',
      'changed the subject',
      'left'
    ]

    for (const msg of messages) {
      for (const phrase of systemPhrases) {
        expect(msg.content.toLowerCase()).not.toContain(phrase)
      }
    }
  })

  it('handles multi-line messages', () => {
    // Should find the multi-line message about The Grove
    const multiLine = messages.find((m) => m.content.includes("it's called The Grove"))
    expect(multiLine).toBeDefined()
    expect(multiLine?.content.split('\n').length).toBeGreaterThan(1)
  })

  it('detects media placeholders', () => {
    const mediaMessages = messages.filter((m) => m.hasMedia)
    expect(mediaMessages.length).toBeGreaterThan(5)

    // Check media types
    const mediaTypes = new Set(mediaMessages.map((m) => m.mediaType))
    expect(mediaTypes).toContain('image')
    expect(mediaTypes).toContain('video')
    expect(mediaTypes).toContain('audio')
    expect(mediaTypes).toContain('sticker')
    expect(mediaTypes).toContain('document')
  })

  it('handles colons in message content', () => {
    // Message: "Let's go: Saturday at 7pm?"
    const withColon = messages.find((m) => m.content.includes("Let's go:"))
    expect(withColon).toBeDefined()
    expect(withColon?.content).toContain('Saturday')
  })

  it('parses messages with time references', () => {
    // "The time is 8:30 AM for the La Cigale market"
    const timeRef = messages.find((m) => m.content.includes('8:30'))
    expect(timeRef).toBeDefined()
    expect(timeRef?.content).toContain('La Cigale')
  })
})

describe('Exclusion Fixtures', () => {
  const content = loadFixture('exclusions.txt')
  const messages = parseWhatsAppChat(content, { format: 'ios' })

  it('parses all messages', () => {
    expect(messages.length).toBeGreaterThan(20)
  })

  it('filters out work-related suggestions', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Work-related messages should not appear as candidates
    const workMessages = result.candidates.filter(
      (c) =>
        c.content.toLowerCase().includes('work project') ||
        c.content.toLowerCase().includes('deadline') ||
        c.content.toLowerCase().includes('office') ||
        c.content.toLowerCase().includes('job interview')
    )
    expect(workMessages.length).toBe(0)
  })

  it('filters out medical appointments', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Medical terms should be excluded
    const medicalMessages = result.candidates.filter(
      (c) =>
        c.content.toLowerCase().includes('dentist') ||
        c.content.toLowerCase().includes('doctor') ||
        c.content.toLowerCase().includes('hospital') ||
        c.content.toLowerCase().includes('vet appointment') ||
        c.content.toLowerCase().includes('optometrist')
    )
    expect(medicalMessages.length).toBe(0)
  })

  it('filters out errands', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Errands should be excluded
    const errandMessages = result.candidates.filter(
      (c) =>
        c.content.toLowerCase().includes('groceries') ||
        c.content.toLowerCase().includes('dry cleaning') ||
        c.content.toLowerCase().includes('laundry') ||
        c.content.toLowerCase().includes('vacuum') ||
        c.content.toLowerCase().includes('mechanic')
    )
    expect(errandMessages.length).toBe(0)
  })

  it('filters out negative constructs', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Negative patterns should be excluded
    const negativeMessages = result.candidates.filter(
      (c) =>
        c.content.toLowerCase().includes("shouldn't") ||
        c.content.toLowerCase().includes("can't") ||
        c.content.toLowerCase().includes("won't") ||
        c.content.toLowerCase().includes('should not')
    )
    expect(negativeMessages.length).toBe(0)
  })

  it('filters out past tense mentions', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Past tense should be excluded
    const pastMessages = result.candidates.filter(
      (c) =>
        c.content.toLowerCase().includes('we went to') ||
        c.content.toLowerCase().includes('already been') ||
        c.content.toLowerCase().includes('we visited') ||
        c.content.toLowerCase().includes('we did try') ||
        c.content.toLowerCase().includes("i've been there")
    )
    expect(pastMessages.length).toBe(0)
  })

  it('returns very few or no candidates from exclusion patterns', () => {
    const result = extractCandidatesByHeuristics(messages)

    // Most messages in this fixture should be excluded
    // Some might slip through, but should be very few
    expect(result.candidates.length).toBeLessThan(5)
  })
})
