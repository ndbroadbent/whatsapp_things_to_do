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
      expect(prompt).toContain('msg')
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

    it('requests structured JSON output with new fields', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates)

      // New short field names
      expect(prompt).toContain('is_act')
      expect(prompt).toContain('title')
      expect(prompt).toContain('act')
      expect(prompt).toContain('obj')
      expect(prompt).toContain('loc')
      expect(prompt).toContain('city')
      expect(prompt).toContain('country')
      expect(prompt).toContain('gen')
      expect(prompt).toContain('com')
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

    it('includes normalization rules', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates)

      expect(prompt).toContain('tramping→hike')
      expect(prompt).toContain('cycling→bike')
      expect(prompt).toContain('film→movie')
      expect(prompt).toContain('cafe≠restaurant')
    })

    it('includes adult content filter instructions', () => {
      const candidates = [createCandidate(1, 'Test message')]

      const prompt = buildClassificationPrompt(candidates)

      // Must filter romantic/intimate content
      expect(prompt).toContain('Romantic/intimate')
      expect(prompt).toContain('adult content')
    })
  })

  describe('parseClassificationResponse', () => {
    it('parses valid JSON array response with new fields', () => {
      const response = `[
        {
          "msg": 1,
          "is_act": true,
          "title": "Dinner at Italian place",
          "score": 0.9,
          "cat": "restaurant",
          "conf": 0.95,
          "gen": false,
          "com": true,
          "act": "eat",
          "act_orig": "dinner",
          "obj": "restaurant",
          "obj_orig": "Italian place",
          "venue": "Italian place",
          "city": "Rome",
          "state": null,
          "country": "Italy"
        }
      ]`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.msg).toBe(1)
      expect(parsed[0]?.is_act).toBe(true)
      expect(parsed[0]?.title).toBe('Dinner at Italian place')
      expect(parsed[0]?.score).toBe(0.9)
      expect(parsed[0]?.cat).toBe('restaurant')
      expect(parsed[0]?.conf).toBe(0.95)
      expect(parsed[0]?.gen).toBe(false)
      expect(parsed[0]?.com).toBe(true)
      expect(parsed[0]?.act).toBe('eat')
      expect(parsed[0]?.venue).toBe('Italian place')
      expect(parsed[0]?.city).toBe('Rome')
      expect(parsed[0]?.country).toBe('Italy')
    })

    it('parses multiple items', () => {
      const response = `[
        {"msg": 1, "is_act": true, "title": "Hiking", "score": 0.8, "cat": "hike", "conf": 0.9, "gen": true, "com": true, "act": "hike", "act_orig": "hiking", "obj": null, "obj_orig": null, "venue": null, "city": "Mountains", "state": null, "country": null},
        {"msg": 2, "is_act": false, "title": "Vet visit", "score": 0.1, "cat": "errand", "conf": 0.85, "gen": false, "com": true, "act": "visit", "act_orig": "visit", "obj": "vet", "obj_orig": "vet", "venue": null, "city": null, "state": null, "country": null}
      ]`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(2)
      expect(parsed[0]?.cat).toBe('hike')
      expect(parsed[1]?.is_act).toBe(false)
    })

    it('handles response with markdown code block', () => {
      const response = `\`\`\`json
[{"msg": 1, "is_act": true, "title": "Beach day", "score": 0.9, "cat": "beach", "conf": 0.95, "gen": true, "com": true, "act": "beach", "act_orig": "beach", "obj": null, "obj_orig": null, "venue": null, "city": "Malibu", "state": "California", "country": "USA"}]
\`\`\``

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.cat).toBe('beach')
    })

    it('handles response with extra text around JSON', () => {
      const response = `Here is the classification:

[{"msg": 1, "is_act": true, "title": "Concert", "score": 0.85, "cat": "concert", "conf": 0.9, "gen": false, "com": true, "act": "attend", "act_orig": "concert", "obj": "concert", "obj_orig": "concert", "venue": "Madison Square Garden", "city": "New York", "state": "NY", "country": "USA"}]

Hope this helps!`

      const parsed = parseClassificationResponse(response)

      expect(parsed).toHaveLength(1)
      expect(parsed[0]?.title).toBe('Concert')
    })

    it('handles null location fields', () => {
      const response = `[{"msg": 1, "is_act": true, "title": "Something fun", "score": 0.7, "cat": "other", "conf": 0.8, "gen": true, "com": true, "act": "do", "act_orig": "do", "obj": null, "obj_orig": null, "venue": null, "city": null, "state": null, "country": null}]`

      const parsed = parseClassificationResponse(response)

      expect(parsed[0]?.venue).toBeNull()
      expect(parsed[0]?.city).toBeNull()
      expect(parsed[0]?.country).toBeNull()
    })

    it('defaults missing boolean fields', () => {
      const response = `[{"msg": 1, "is_act": true, "title": "Test", "score": 0.5, "cat": "other", "conf": 0.5}]`

      const parsed = parseClassificationResponse(response)

      // Defaults: gen=true, com=true
      expect(parsed[0]?.gen).toBe(true)
      expect(parsed[0]?.com).toBe(true)
    })

    it('throws on invalid JSON', () => {
      const response = 'not valid json at all'

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('throws on non-array JSON', () => {
      const response = '{"msg": 1}'

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('throws on empty response', () => {
      const response = ''

      expect(() => parseClassificationResponse(response)).toThrow()
    })

    it('validates message IDs when expected IDs provided', () => {
      const response = `[{"msg": 1, "is_act": true, "title": "Test", "score": 0.5, "cat": "other", "conf": 0.5}]`

      // Should not throw when ID matches
      expect(() => parseClassificationResponse(response, [1])).not.toThrow()

      // Should throw when no IDs match
      expect(() => parseClassificationResponse(response, [999])).toThrow(/no matching message IDs/)
    })
  })
})
