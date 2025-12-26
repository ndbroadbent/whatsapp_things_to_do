/**
 * Context Window Unit Tests
 */

import { describe, expect, it } from 'vitest'
import type { ParsedMessage } from '../types'
import { getMessageContext, isInContextWindow, MIN_CONTEXT_MESSAGES } from './context-window'

function createMessage(id: number, content: string, sender = 'User'): ParsedMessage {
  return {
    id,
    content,
    sender,
    timestamp: new Date('2025-01-15T10:00:00Z'),
    rawLine: `[1/15/25, 10:00:00 AM] ${sender}: ${content}`,
    hasMedia: false,
    source: 'whatsapp'
  }
}

describe('getMessageContext', () => {
  it('throws for invalid index', () => {
    const messages = [createMessage(1, 'Hello')]
    expect(() => getMessageContext(messages, 10)).toThrow(/not found/)
  })

  it('returns at least MIN_CONTEXT_MESSAGES before and after', () => {
    const messages = [
      createMessage(1, 'First'),
      createMessage(2, 'Second'),
      createMessage(3, 'Target'),
      createMessage(4, 'Fourth'),
      createMessage(5, 'Fifth')
    ]
    const ctx = getMessageContext(messages, 2)
    expect(ctx.before.length).toBeGreaterThanOrEqual(MIN_CONTEXT_MESSAGES)
    expect(ctx.after.length).toBeGreaterThanOrEqual(MIN_CONTEXT_MESSAGES)
  })

  it('expands context to reach MIN_CONTEXT_CHARS', () => {
    // Short messages - need more than 2 to reach 280 chars
    const messages = [
      createMessage(1, 'A'),
      createMessage(2, 'B'),
      createMessage(3, 'C'),
      createMessage(4, 'D'),
      createMessage(5, 'Target'),
      createMessage(6, 'F'),
      createMessage(7, 'G'),
      createMessage(8, 'H'),
      createMessage(9, 'I')
    ]
    const ctx = getMessageContext(messages, 4)
    // Should get more than 2 messages to reach 280 chars
    expect(ctx.before.length).toBeGreaterThan(2)
    expect(ctx.after.length).toBeGreaterThan(2)
  })

  it('stops expanding when both minimums are met', () => {
    // Long messages - 2 messages should exceed 280 chars
    const longContent = 'x'.repeat(200)
    const messages = [
      createMessage(1, longContent),
      createMessage(2, longContent),
      createMessage(3, longContent),
      createMessage(4, 'Target'),
      createMessage(5, longContent),
      createMessage(6, longContent),
      createMessage(7, longContent)
    ]
    const ctx = getMessageContext(messages, 3)
    // With 200-char messages, 2 messages = 400+ chars, so should stop at 2
    expect(ctx.before.length).toBe(2)
    expect(ctx.after.length).toBe(2)
  })

  it('tracks first and last message IDs correctly', () => {
    const messages = [
      createMessage(10, 'First'),
      createMessage(20, 'Second'),
      createMessage(30, 'Target'),
      createMessage(40, 'Fourth'),
      createMessage(50, 'Fifth')
    ]
    const ctx = getMessageContext(messages, 2)
    expect(ctx.targetMessageId).toBe(30)
    // firstMessageId should be the earliest message in context
    expect(ctx.firstMessageId).toBeLessThan(30)
    // lastMessageId should be the latest message in context
    expect(ctx.lastMessageId).toBeGreaterThan(30)
  })

  it('handles target at start of messages', () => {
    const messages = [
      createMessage(1, 'Target'),
      createMessage(2, 'Second'),
      createMessage(3, 'Third')
    ]
    const ctx = getMessageContext(messages, 0)
    expect(ctx.before.length).toBe(0)
    expect(ctx.after.length).toBeGreaterThanOrEqual(2)
    expect(ctx.firstMessageId).toBe(1) // No messages before, so first = target
  })

  it('handles target at end of messages', () => {
    const messages = [
      createMessage(1, 'First'),
      createMessage(2, 'Second'),
      createMessage(3, 'Target')
    ]
    const ctx = getMessageContext(messages, 2)
    expect(ctx.before.length).toBeGreaterThanOrEqual(2)
    expect(ctx.after.length).toBe(0)
    expect(ctx.lastMessageId).toBe(3) // No messages after, so last = target
  })
})

describe('isInContextWindow', () => {
  it('returns true for message ID within range', () => {
    const ctx = {
      before: [],
      after: [],
      firstMessageId: 10,
      lastMessageId: 50,
      targetMessageId: 30
    }
    expect(isInContextWindow(15, ctx)).toBe(true)
    expect(isInContextWindow(40, ctx)).toBe(true)
  })

  it('returns false for message ID outside range', () => {
    const ctx = {
      before: [],
      after: [],
      firstMessageId: 10,
      lastMessageId: 50,
      targetMessageId: 30
    }
    expect(isInContextWindow(5, ctx)).toBe(false)
    expect(isInContextWindow(55, ctx)).toBe(false)
  })

  it('returns false for target message ID itself', () => {
    const ctx = {
      before: [],
      after: [],
      firstMessageId: 10,
      lastMessageId: 50,
      targetMessageId: 30
    }
    expect(isInContextWindow(30, ctx)).toBe(false)
  })

  it('returns true for boundary message IDs', () => {
    const ctx = {
      before: [],
      after: [],
      firstMessageId: 10,
      lastMessageId: 50,
      targetMessageId: 30
    }
    expect(isInContextWindow(10, ctx)).toBe(true) // first
    expect(isInContextWindow(50, ctx)).toBe(true) // last
  })
})
