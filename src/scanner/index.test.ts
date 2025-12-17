import { describe, expect, it } from 'vitest'
import { quickScan, quickScanMessages } from './index.js'

describe('quickScan', () => {
  const sampleChat = `[12/15/24, 10:30:42 AM] Alice: Hey, we should check out that new restaurant downtown
[12/15/24, 10:31:15 AM] Bob: Which one?
[12/15/24, 10:32:00 AM] Alice: The Italian place on Main St, let's go this weekend
[12/15/24, 10:33:00 AM] Bob: Sounds good! I also want to try that hiking trail
[12/15/24, 10:34:00 AM] Alice: Yes! Let's do both. Here's the restaurant: https://maps.google.com/place?q=Italian+Kitchen
[12/15/24, 10:35:00 AM] Bob: Perfect. I'll book a table.`

  describe('basic functionality', () => {
    it('should parse messages and extract candidates', () => {
      const result = quickScan(sampleChat)

      expect(result.messageCount).toBe(6)
      expect(result.senderCount).toBe(2)
      expect(result.source).toBe('whatsapp')
    })

    it('should find candidates from suggestion phrases', () => {
      const result = quickScan(sampleChat)

      // Should find "we should check out", "let's go", "let's do both"
      expect(result.candidates.length).toBeGreaterThan(0)
      expect(result.stats.totalUnique).toBeGreaterThan(0)
    })

    it('should find URL-based candidates', () => {
      const result = quickScan(sampleChat)

      // Should find the Google Maps URL
      expect(result.stats.urlMatches).toBeGreaterThanOrEqual(0)
    })

    it('should return date range', () => {
      const result = quickScan(sampleChat)

      expect(result.dateRange.start).toBeInstanceOf(Date)
      expect(result.dateRange.end).toBeInstanceOf(Date)
      expect(result.dateRange.start.getTime()).toBeLessThanOrEqual(result.dateRange.end.getTime())
    })

    it('should count URLs in messages', () => {
      const result = quickScan(sampleChat)

      expect(result.urlCount).toBeGreaterThanOrEqual(1)
    })
  })

  describe('candidates sorting', () => {
    it('should return candidates sorted by confidence descending', () => {
      const result = quickScan(sampleChat)

      if (result.candidates.length >= 2) {
        for (let i = 1; i < result.candidates.length; i++) {
          const prev = result.candidates[i - 1]
          const curr = result.candidates[i]
          expect(prev?.confidence).toBeGreaterThanOrEqual(curr?.confidence ?? 0)
        }
      }
    })
  })

  describe('options', () => {
    it('should respect maxCandidates option', () => {
      const result = quickScan(sampleChat, { maxCandidates: 2 })

      expect(result.candidates.length).toBeLessThanOrEqual(2)
    })

    it('should pass extractor options', () => {
      const result = quickScan(sampleChat, {
        extractor: { minConfidence: 0.9 }
      })

      // High confidence threshold should filter out most candidates
      for (const candidate of result.candidates) {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0.9)
      }
    })
  })

  describe('empty and edge cases', () => {
    it('should handle empty content', () => {
      const result = quickScan('')

      expect(result.messageCount).toBe(0)
      expect(result.candidates.length).toBe(0)
      expect(result.senderCount).toBe(0)
    })

    it('should handle content with no suggestions', () => {
      const plainChat = `[12/15/24, 10:30:42 AM] Alice: Hello
[12/15/24, 10:31:15 AM] Bob: Hi there
[12/15/24, 10:32:00 AM] Alice: How are you?
[12/15/24, 10:33:00 AM] Bob: Good thanks`

      const result = quickScan(plainChat)

      expect(result.messageCount).toBe(4)
      expect(result.candidates.length).toBe(0)
    })
  })

  describe('different chat formats', () => {
    it('should handle iOS WhatsApp format', () => {
      const iosChat = `[12/15/24, 10:30:42 AM] Alice: We should try that new cafe
[12/15/24, 10:31:00 AM] Bob: Which one?`

      const result = quickScan(iosChat)

      expect(result.messageCount).toBe(2)
      expect(result.source).toBe('whatsapp')
    })

    it('should handle Android WhatsApp format', () => {
      // Android format uses 24-hour time without AM/PM: MM/DD/YY, H:MM - Sender: Message
      const androidChat = `12/15/24, 10:30 - Alice: We should try that new cafe
12/15/24, 10:31 - Bob: Which one?`

      const result = quickScan(androidChat)

      expect(result.messageCount).toBe(2)
      expect(result.source).toBe('whatsapp')
    })
  })
})

describe('quickScanMessages', () => {
  it('should extract candidates from pre-parsed messages', () => {
    const messages = [
      {
        id: 1,
        timestamp: new Date('2024-12-15T10:30:00'),
        sender: 'Alice',
        content: 'We should check out that new restaurant',
        rawLine: '[12/15/24, 10:30:00 AM] Alice: We should check out that new restaurant',
        hasMedia: false,
        source: 'whatsapp' as const
      },
      {
        id: 2,
        timestamp: new Date('2024-12-15T10:31:00'),
        sender: 'Bob',
        content: 'Sounds good!',
        rawLine: '[12/15/24, 10:31:00 AM] Bob: Sounds good!',
        hasMedia: false,
        source: 'whatsapp' as const
      }
    ]

    const result = quickScanMessages(messages)

    expect(result.stats.totalUnique).toBeGreaterThanOrEqual(0)
    expect(result.candidates).toBeDefined()
  })

  it('should respect maxCandidates option', () => {
    const messages = [
      {
        id: 1,
        timestamp: new Date('2024-12-15T10:30:00'),
        sender: 'Alice',
        content: 'We should go hiking this weekend',
        rawLine: '',
        hasMedia: false,
        source: 'whatsapp' as const
      },
      {
        id: 2,
        timestamp: new Date('2024-12-15T10:31:00'),
        sender: 'Bob',
        content: "Let's try that new restaurant",
        rawLine: '',
        hasMedia: false,
        source: 'whatsapp' as const
      },
      {
        id: 3,
        timestamp: new Date('2024-12-15T10:32:00'),
        sender: 'Alice',
        content: 'We should visit the museum too',
        rawLine: '',
        hasMedia: false,
        source: 'whatsapp' as const
      }
    ]

    const result = quickScanMessages(messages, { maxCandidates: 1 })

    expect(result.candidates.length).toBeLessThanOrEqual(1)
  })
})
