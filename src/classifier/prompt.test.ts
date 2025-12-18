import { describe, expect, it } from 'vitest'
import type { CandidateMessage } from '../types.js'
import { buildClassificationPrompt, parseClassificationResponse } from './prompt.js'

function createCandidate(id: number, content: string, context = ''): CandidateMessage {
  return {
    messageId: id,
    content,
    sender: 'Test User',
    timestamp: new Date('2025-01-15T10:30:00'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    context
  }
}

describe('Classifier Prompt', () => {
  describe('buildClassificationPrompt', () => {
    it('builds prompt for single candidate', () => {
      const candidates = [createCandidate(1, 'We should go to that restaurant')]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('We should go to that restaurant')
      expect(prompt).toContain('message_id')
      expect(prompt).toContain('JSON')
    })

    it('builds prompt for multiple candidates', () => {
      const candidates = [
        createCandidate(1, 'We should go hiking'),
        createCandidate(2, "Let's try that cafe"),
        createCandidate(3, 'Check out this concert')
      ]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('We should go hiking')
      expect(prompt).toContain("Let's try that cafe")
      expect(prompt).toContain('Check out this concert')
    })

    it('includes context when provided', () => {
      const candidates = [
        createCandidate(1, 'We should go there', 'Previous: I found a great place')
      ]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('I found a great place')
    })

    it('includes message ID in prompt', () => {
      const candidates = [createCandidate(42, 'We should visit')]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('42')
    })

    it('requests structured JSON output', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('is_activity')
      expect(prompt).toContain('activity')
      expect(prompt).toContain('location')
      expect(prompt).toContain('category')
      expect(prompt).toContain('confidence')
    })

    it('lists valid categories', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('restaurant')
      expect(prompt).toContain('cafe')
      expect(prompt).toContain('hike')
      expect(prompt).toContain('beach')
      expect(prompt).toContain('concert')
    })

    it('includes adult content filter instructions', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates)

      // Must filter romantic/intimate content
      expect(prompt).toContain('Romantic/intimate')
      expect(prompt).toContain('Adult or suggestive')
      expect(prompt).toContain('Private relationship moments')
      expect(prompt).toContain('NEVER appear in results')
    })
  })

  describe('parseClassificationResponse', () => {
    it('parses valid JSON array response', () => {
      const response = `[
        {
          "message_id": 1,
          "is_activity": true,
          "activity": "Dinner at Italian place",
          "location": "Rome, Italy",
          "activity_score": 0.9,
          "category": "restaurant",
          "confidence": 0.95
        }
      ]`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.message_id).toBe(1)
      expect(parsed[0]?.is_activity).toBe(true)
      expect(parsed[0]?.activity).toBe('Dinner at Italian place')
      expect(parsed[0]?.location).toBe('Rome, Italy')
      expect(parsed[0]?.activity_score).toBe(0.9)
      expect(parsed[0]?.category).toBe('restaurant')
      expect(parsed[0]?.confidence).toBe(0.95)
    })

    it('parses multiple items', () => {
      const response = `[
        {"message_id": 1, "is_activity": true, "activity": "Hiking", "location": "Mountains", "activity_score": 0.8, "category": "hike", "confidence": 0.9},
        {"message_id": 2, "is_activity": false, "activity": "Vet visit", "location": null, "activity_score": 0.1, "category": "errand", "confidence": 0.85}
      ]`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(2)
      expect(parsed[0]?.category).toBe('hike')
      expect(parsed[1]?.is_activity).toBe(false)
    })

    it('handles response with markdown code block', () => {
      const response = `\`\`\`json
[{"message_id": 1, "is_activity": true, "activity": "Beach day", "location": "Malibu", "activity_score": 0.9, "category": "beach", "confidence": 0.95}]
\`\`\``

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.category).toBe('beach')
    })

    it('handles response with extra text around JSON', () => {
      const response = `Here is the classification:

[{"message_id": 1, "is_activity": true, "activity": "Concert", "location": "Madison Square Garden", "activity_score": 0.85, "category": "concert", "confidence": 0.9}]

Hope this helps!`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.activity).toBe('Concert')
    })

    it('handles null location', () => {
      const response = `[{"message_id": 1, "is_activity": true, "activity": "Something fun", "location": null, "activity_score": 0.7, "category": "other", "confidence": 0.8}]`

      const parsed = parseClassificationResponse(response)

      expect(parsed[0]?.location).toBeNull()
    })

    it('throws on invalid JSON', () => {
      const response = 'not valid json at all'

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('throws on non-array JSON', () => {
      const response = '{"message_id": 1}'

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('throws on empty response', () => {
      const response = ''

      expect(() => parseClassificationResponse(response)).toThrow()
    })
  })
})
