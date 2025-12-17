import { describe, expect, it } from 'vitest'
import { detectChatSource, parseChat, parseChatStream, parseChatWithStats } from './index.js'

describe('Parser Module', () => {
  describe('detectChatSource', () => {
    it('detects WhatsApp iOS format (brackets)', () => {
      const content = '[1/15/25, 10:30:00 AM] John: Hello'

      const source = detectChatSource(content)

      expect(source).toBe('whatsapp')
    })

    it('detects WhatsApp iOS format with 4-digit year', () => {
      const content = '[15/01/2025, 10:30:00] John: Hello'

      const source = detectChatSource(content)

      expect(source).toBe('whatsapp')
    })

    it('detects WhatsApp Android format (no brackets)', () => {
      const content = '1/15/25, 10:30 AM - John: Hello'

      const source = detectChatSource(content)

      expect(source).toBe('whatsapp')
    })

    it('detects iMessage format', () => {
      const content = 'Jan 15, 2025  10:30:00 AM'

      const source = detectChatSource(content)

      expect(source).toBe('imessage')
    })

    it('defaults to whatsapp for unknown format', () => {
      const content = 'Some random text that does not match any pattern'

      const source = detectChatSource(content)

      expect(source).toBe('whatsapp')
    })

    it('handles empty content', () => {
      const source = detectChatSource('')

      expect(source).toBe('whatsapp')
    })
  })

  describe('parseChat', () => {
    it('parses WhatsApp iOS messages', () => {
      const content = `[1/15/25, 10:30:00 AM] John: Hello
[1/15/25, 10:31:00 AM] Jane: Hi there!`

      const messages = parseChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[0]?.content).toBe('Hello')
      expect(messages[1]?.sender).toBe('Jane')
      expect(messages[1]?.content).toBe('Hi there!')
    })

    it('parses iMessage format', () => {
      const content = `Jan 15, 2025  10:30:00 AM
John Doe
Hello world

Jan 15, 2025  10:31:00 AM
Jane Smith
Hi there!`

      const messages = parseChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John Doe')
      expect(messages[0]?.content).toBe('Hello world')
      expect(messages[1]?.sender).toBe('Jane Smith')
    })

    it('handles empty content', () => {
      const messages = parseChat('')

      expect(messages).toHaveLength(0)
    })

    it('passes options to WhatsApp parser', () => {
      const content = `[1/15/25, 10:30:00 AM] John: Hello
[1/15/25, 10:31:00 AM] John: World`

      const messages = parseChat(content, { format: 'ios' })

      // Implementation depends on parser behavior
      expect(messages.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('parseChatWithStats', () => {
    it('returns messages array', () => {
      const content = '[1/15/25, 10:30:00 AM] John: Hello'

      const result = parseChatWithStats(content)

      expect(result.messages).toHaveLength(1)
    })

    it('extracts unique senders', () => {
      const content = `[1/15/25, 10:30:00 AM] John: Hello
[1/15/25, 10:31:00 AM] Jane: Hi
[1/15/25, 10:32:00 AM] John: How are you?`

      const result = parseChatWithStats(content)

      expect(result.senders).toContain('John')
      expect(result.senders).toContain('Jane')
      expect(result.senders).toHaveLength(2)
    })

    it('calculates date range', () => {
      const content = `[1/10/25, 10:30:00 AM] John: First
[1/15/25, 10:30:00 AM] John: Last`

      const result = parseChatWithStats(content)

      expect(result.dateRange.start.getDate()).toBe(10)
      expect(result.dateRange.end.getDate()).toBe(15)
    })

    it('counts messages', () => {
      const content = `[1/15/25, 10:30:00 AM] John: One
[1/15/25, 10:31:00 AM] John: Two
[1/15/25, 10:32:00 AM] John: Three`

      const result = parseChatWithStats(content)

      expect(result.messageCount).toBe(3)
    })

    it('counts URLs', () => {
      const content = `[1/15/25, 10:30:00 AM] John: Check this https://example.com
[1/15/25, 10:31:00 AM] John: And this https://test.com and https://other.com`

      const result = parseChatWithStats(content)

      expect(result.urlCount).toBe(3)
    })

    it('handles empty content', () => {
      const result = parseChatWithStats('')

      expect(result.messages).toHaveLength(0)
      expect(result.senders).toHaveLength(0)
      expect(result.messageCount).toBe(0)
      expect(result.urlCount).toBe(0)
    })

    it('handles messages without URLs', () => {
      const content = '[1/15/25, 10:30:00 AM] John: No URLs here'

      const result = parseChatWithStats(content)

      expect(result.urlCount).toBe(0)
    })
  })

  describe('parseChatStream', () => {
    it('yields messages for WhatsApp source', async () => {
      const lines = (async function* () {
        yield '[1/15/25, 10:30:00 AM] John: Hello'
        yield '[1/15/25, 10:31:00 AM] Jane: Hi'
      })()

      const messages = []
      for await (const msg of parseChatStream(lines, 'whatsapp')) {
        messages.push(msg)
      }

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[1]?.sender).toBe('Jane')
    })

    it('yields messages for iMessage source', async () => {
      const lines = (async function* () {
        yield 'Jan 15, 2025  10:30:00 AM'
        yield 'John Doe'
        yield 'Hello world'
        yield ''
        yield 'Jan 15, 2025  10:31:00 AM'
        yield 'Jane Smith'
        yield 'Hi there'
        yield ''
      })()

      const messages = []
      for await (const msg of parseChatStream(lines, 'imessage')) {
        messages.push(msg)
      }

      expect(messages.length).toBeGreaterThanOrEqual(1)
    })

    it('handles empty stream', async () => {
      const lines = (async function* (): AsyncIterable<string> {
        // Empty stream - yields nothing
      })()

      const messages = []
      for await (const msg of parseChatStream(lines, 'whatsapp')) {
        messages.push(msg)
      }

      expect(messages).toHaveLength(0)
    })

    it('passes options to WhatsApp stream parser', async () => {
      const lines = (async function* () {
        yield '[1/15/25, 10:30:00 AM] John: Hello'
      })()

      const messages = []
      for await (const msg of parseChatStream(lines, 'whatsapp', { format: 'ios' })) {
        messages.push(msg)
      }

      expect(messages).toHaveLength(1)
    })
  })
})
