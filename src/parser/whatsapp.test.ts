import { describe, expect, it } from 'vitest'
import { detectFormat, parseWhatsAppChat } from './whatsapp.js'

describe('WhatsApp Parser', () => {
  describe('detectFormat', () => {
    it('detects iOS format', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Hello
[1/15/24, 10:31:02 AM] Jane: Hi there!`
      expect(detectFormat(content)).toBe('ios')
    })

    it('detects Android format', () => {
      const content = `1/15/24, 10:30 - John: Hello
1/15/24, 10:31 - Jane: Hi there!`
      expect(detectFormat(content)).toBe('android')
    })

    it('defaults to iOS when unclear', () => {
      const content = 'Random text without patterns'
      expect(detectFormat(content)).toBe('ios')
    })
  })

  describe('parseWhatsAppChat - iOS format', () => {
    it('parses simple messages', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Hello
[1/15/24, 10:31:02 AM] Jane: Hi there!`

      const messages = parseWhatsAppChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[0]?.content).toBe('Hello')
      expect(messages[1]?.sender).toBe('Jane')
      expect(messages[1]?.content).toBe('Hi there!')
    })

    it('parses multi-line messages', () => {
      const content = `[1/15/24, 10:30:45 AM] John: This is line one
and this is line two
and line three
[1/15/24, 10:31:02 AM] Jane: Single line`

      const messages = parseWhatsAppChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.content).toBe('This is line one\nand this is line two\nand line three')
      expect(messages[1]?.content).toBe('Single line')
    })

    it('extracts URLs from messages', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Check out https://example.com/page`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.urls).toEqual(['https://example.com/page'])
    })

    it('detects media placeholders', () => {
      const content = `[1/15/24, 10:30:45 AM] John: image omitted`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.hasMedia).toBe(true)
      expect(messages[0]?.mediaType).toBe('image')
    })

    it('skips system messages', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Hello
[1/15/24, 10:31:02 AM] Jane: Messages and calls are end-to-end encrypted
[1/15/24, 10:32:00 AM] Bob: Hi`

      const messages = parseWhatsAppChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[1]?.sender).toBe('Bob')
    })

    it('parses timestamps correctly', () => {
      const content = `[12/31/23, 11:59:59 PM] John: New Year's Eve`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.timestamp.getFullYear()).toBe(2023)
      expect(messages[0]?.timestamp.getMonth()).toBe(11) // December (0-indexed)
      expect(messages[0]?.timestamp.getDate()).toBe(31)
      expect(messages[0]?.timestamp.getHours()).toBe(23)
    })

    it('handles AM/PM correctly', () => {
      const content = `[1/15/24, 12:30:00 AM] John: Midnight-ish
[1/15/24, 12:30:00 PM] Jane: Noon-ish`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.timestamp.getHours()).toBe(0)
      expect(messages[1]?.timestamp.getHours()).toBe(12)
    })
  })

  describe('parseWhatsAppChat - Android format', () => {
    it('parses simple messages', () => {
      const content = `1/15/24, 10:30 - John: Hello
1/15/24, 10:31 - Jane: Hi there!`

      const messages = parseWhatsAppChat(content, { format: 'android' })

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[0]?.content).toBe('Hello')
    })

    it('parses multi-line messages', () => {
      const content = `1/15/24, 10:30 - John: Line one
Line two
1/15/24, 10:31 - Jane: Single`

      const messages = parseWhatsAppChat(content, { format: 'android' })

      expect(messages).toHaveLength(2)
      expect(messages[0]?.content).toBe('Line one\nLine two')
    })
  })

  describe('edge cases', () => {
    it('handles empty input', () => {
      const messages = parseWhatsAppChat('')
      expect(messages).toHaveLength(0)
    })

    it('handles input with no valid messages', () => {
      const content = 'Just some random text\nwith no timestamps'
      const messages = parseWhatsAppChat(content)
      expect(messages).toHaveLength(0)
    })

    it('handles messages with colons in content', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Time is 3:30 PM`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.content).toBe('Time is 3:30 PM')
    })

    it('handles messages with special characters', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Hello! How are you? 😀`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.content).toBe('Hello! How are you? 😀')
    })

    it('cleans trailing punctuation from URLs', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Check this: https://example.com.`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.urls).toEqual(['https://example.com'])
    })

    it('assigns sequential IDs', () => {
      const content = `[1/15/24, 10:30:45 AM] John: First
[1/15/24, 10:31:02 AM] Jane: Second
[1/15/24, 10:32:00 AM] Bob: Third`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.id).toBe(0)
      expect(messages[1]?.id).toBe(1)
      expect(messages[2]?.id).toBe(2)
    })

    it('sets source to whatsapp', () => {
      const content = `[1/15/24, 10:30:45 AM] John: Hello`

      const messages = parseWhatsAppChat(content)

      expect(messages[0]?.source).toBe('whatsapp')
    })
  })
})
