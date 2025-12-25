import { describe, expect, it } from 'vitest'
import type { CandidateMessage, ContextMessage } from '../types'
import { resolveMessageWithOffset } from './message-offset'

function createContextMessage(id: number, sender: string, content: string): ContextMessage {
  return {
    id,
    sender,
    content,
    timestamp: new Date('2025-01-15T10:30:00Z')
  }
}

function createCandidate(overrides: Partial<CandidateMessage> = {}): CandidateMessage {
  return {
    messageId: 100,
    content: 'Candidate message',
    sender: 'Candidate Sender',
    timestamp: new Date('2025-01-15T10:30:00Z'),
    source: { type: 'regex', pattern: 'test' },
    confidence: 0.8,
    candidateType: 'suggestion',
    contextBefore: [],
    contextAfter: [],
    ...overrides
  }
}

describe('resolveMessageWithOffset', () => {
  describe('offset = 0', () => {
    it('returns candidate message directly', () => {
      const candidate = createCandidate({
        messageId: 42,
        sender: 'Alice',
        content: 'Let us go hiking'
      })

      const result = resolveMessageWithOffset(candidate, 0)

      expect(result.id).toBe(42)
      expect(result.sender).toBe('Alice')
      expect(result.content).toBe('Let us go hiking')
    })
  })

  describe('negative offset (contextBefore)', () => {
    it('resolves off=-1 to last message in contextBefore', () => {
      const candidate = createCandidate({
        contextBefore: [
          createContextMessage(1, 'Bob', 'First message'),
          createContextMessage(2, 'Alice', 'Second message'),
          createContextMessage(3, 'Bob', 'Let us try that restaurant')
        ]
      })

      const result = resolveMessageWithOffset(candidate, -1)

      expect(result.id).toBe(3)
      expect(result.sender).toBe('Bob')
      expect(result.content).toBe('Let us try that restaurant')
    })

    it('resolves off=-2 to second-to-last message in contextBefore', () => {
      const candidate = createCandidate({
        contextBefore: [
          createContextMessage(1, 'Bob', 'First message'),
          createContextMessage(2, 'Alice', 'We should go kayaking'),
          createContextMessage(3, 'Bob', 'That sounds fun')
        ]
      })

      const result = resolveMessageWithOffset(candidate, -2)

      expect(result.id).toBe(2)
      expect(result.sender).toBe('Alice')
      expect(result.content).toBe('We should go kayaking')
    })

    it('resolves off=-3 to third-to-last message', () => {
      const candidate = createCandidate({
        contextBefore: [
          createContextMessage(1, 'Bob', 'Check out this cafe'),
          createContextMessage(2, 'Alice', 'Where is it?'),
          createContextMessage(3, 'Bob', 'Downtown')
        ]
      })

      const result = resolveMessageWithOffset(candidate, -3)

      expect(result.id).toBe(1)
      expect(result.sender).toBe('Bob')
      expect(result.content).toBe('Check out this cafe')
    })

    it('throws when offset exceeds contextBefore length', () => {
      const candidate = createCandidate({
        contextBefore: [createContextMessage(1, 'Bob', 'Only one message')]
      })

      expect(() => resolveMessageWithOffset(candidate, -5)).toThrow(
        'Invalid offset -5 for msg=100: contextBefore has 1 messages'
      )
    })

    it('throws when contextBefore is empty', () => {
      const candidate = createCandidate({
        contextBefore: []
      })

      expect(() => resolveMessageWithOffset(candidate, -1)).toThrow(
        'Invalid offset -1 for msg=100: contextBefore has 0 messages'
      )
    })
  })

  describe('positive offset (contextAfter)', () => {
    it('resolves off=+1 to first message in contextAfter', () => {
      const candidate = createCandidate({
        contextAfter: [
          createContextMessage(101, 'Alice', 'The place is called Cafe Nero'),
          createContextMessage(102, 'Bob', 'Sounds good')
        ]
      })

      const result = resolveMessageWithOffset(candidate, 1)

      expect(result.id).toBe(101)
      expect(result.sender).toBe('Alice')
      expect(result.content).toBe('The place is called Cafe Nero')
    })

    it('resolves off=+2 to second message in contextAfter', () => {
      const candidate = createCandidate({
        contextAfter: [
          createContextMessage(101, 'Alice', 'What about dinner?'),
          createContextMessage(102, 'Bob', 'Let us go to Sushi Place on Main St'),
          createContextMessage(103, 'Alice', 'Perfect')
        ]
      })

      const result = resolveMessageWithOffset(candidate, 2)

      expect(result.id).toBe(102)
      expect(result.sender).toBe('Bob')
      expect(result.content).toBe('Let us go to Sushi Place on Main St')
    })

    it('throws when offset exceeds contextAfter length', () => {
      const candidate = createCandidate({
        contextAfter: [createContextMessage(101, 'Alice', 'One message only')]
      })

      expect(() => resolveMessageWithOffset(candidate, 5)).toThrow(
        'Invalid offset 5 for msg=100: contextAfter has 1 messages'
      )
    })

    it('throws when contextAfter is empty', () => {
      const candidate = createCandidate({
        contextAfter: []
      })

      expect(() => resolveMessageWithOffset(candidate, 1)).toThrow(
        'Invalid offset 1 for msg=100: contextAfter has 0 messages'
      )
    })
  })

  describe('real-world scenario', () => {
    it('handles Bay of Islands scenario with off=-2', () => {
      // This is the exact scenario from the E2E test failure
      const candidate = createCandidate({
        messageId: 130,
        content: 'great beaches',
        sender: 'John Smith',
        contextBefore: [
          createContextMessage(125, 'John Smith', 'And good coffee'),
          createContextMessage(126, 'Alice Smith', 'Yay'),
          createContextMessage(127, 'Alice Smith', 'For the lunch and coffee'),
          createContextMessage(
            128,
            'Alice Smith',
            'Wanna go to bay of islands for our anniversary?\nhttps://maps.app.goo.gl/JHKspRDJ5m6bhzFT9?g_st=iw'
          ),
          createContextMessage(129, 'John Smith', 'Sounds great!')
        ]
      })

      // off=-2 means second-to-last = the Bay of Islands message
      const result = resolveMessageWithOffset(candidate, -2)

      expect(result.id).toBe(128)
      expect(result.sender).toBe('Alice Smith')
      expect(result.content).toContain('bay of islands')
    })
  })

  describe('works with both contextBefore and contextAfter populated', () => {
    it('can resolve to either direction', () => {
      const candidate = createCandidate({
        contextBefore: [
          createContextMessage(1, 'Bob', 'Before message 1'),
          createContextMessage(2, 'Alice', 'Before message 2')
        ],
        contextAfter: [
          createContextMessage(101, 'Bob', 'After message 1'),
          createContextMessage(102, 'Alice', 'After message 2')
        ]
      })

      expect(resolveMessageWithOffset(candidate, -1).content).toBe('Before message 2')
      expect(resolveMessageWithOffset(candidate, -2).content).toBe('Before message 1')
      expect(resolveMessageWithOffset(candidate, 1).content).toBe('After message 1')
      expect(resolveMessageWithOffset(candidate, 2).content).toBe('After message 2')
    })
  })
})
