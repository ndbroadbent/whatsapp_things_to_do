import { describe, expect, it } from 'vitest'
import { parseIMessageChat } from './imessage.js'

describe('iMessage Parser', () => {
  describe('parseIMessageChat', () => {
    it('parses simple messages', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
Hello there!
Apr 02, 2025  8:53:15 AM
Jane
Hi John!`

      const messages = parseIMessageChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[0]?.content).toBe('Hello there!')
      expect(messages[1]?.sender).toBe('Jane')
      expect(messages[1]?.content).toBe('Hi John!')
    })

    it('parses messages with read receipts', () => {
      const content = `Apr 02, 2025  8:52:29 AM (Read by you after 39 minutes, 44 seconds)
John
Message with read receipt`

      const messages = parseIMessageChat(content)

      expect(messages).toHaveLength(1)
      expect(messages[0]?.sender).toBe('John')
      expect(messages[0]?.content).toBe('Message with read receipt')
    })

    it('parses multi-line messages', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
Line one
Line two
Line three
Apr 02, 2025  8:53:15 AM
Jane
Single line`

      const messages = parseIMessageChat(content)

      expect(messages).toHaveLength(2)
      expect(messages[0]?.content).toBe('Line one\nLine two\nLine three')
      expect(messages[1]?.content).toBe('Single line')
    })

    it('parses messages from Me', () => {
      const content = `Apr 02, 2025  9:32:50 AM
Me
My message to someone`

      const messages = parseIMessageChat(content)

      expect(messages).toHaveLength(1)
      expect(messages[0]?.sender).toBe('Me')
      expect(messages[0]?.content).toBe('My message to someone')
    })

    it('extracts URLs from messages', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
Check out https://example.com/page`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.urls).toEqual(['https://example.com/page'])
    })

    it('parses timestamps correctly', () => {
      const content = `Dec 31, 2024  11:59:59 PM
John
Happy New Year!`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.timestamp.getFullYear()).toBe(2024)
      expect(messages[0]?.timestamp.getMonth()).toBe(11) // December (0-indexed)
      expect(messages[0]?.timestamp.getDate()).toBe(31)
      expect(messages[0]?.timestamp.getHours()).toBe(23)
      expect(messages[0]?.timestamp.getMinutes()).toBe(59)
      expect(messages[0]?.timestamp.getSeconds()).toBe(59)
    })

    it('handles AM/PM correctly', () => {
      const content = `Jan 15, 2025  12:30:00 AM
John
Midnight message
Jan 15, 2025  12:30:00 PM
Jane
Noon message`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.timestamp.getHours()).toBe(0)
      expect(messages[1]?.timestamp.getHours()).toBe(12)
    })

    it('handles single digit dates', () => {
      const content = `Jan 5, 2025  8:52:29 AM
John
Single digit day`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.timestamp.getDate()).toBe(5)
    })
  })

  describe('edge cases', () => {
    it('handles empty input', () => {
      const messages = parseIMessageChat('')
      expect(messages).toHaveLength(0)
    })

    it('handles input with no valid messages', () => {
      const content = 'Just some random text\nwith no timestamps'
      const messages = parseIMessageChat(content)
      expect(messages).toHaveLength(0)
    })

    it('skips messages with empty content', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John

Apr 02, 2025  8:53:15 AM
Jane
Actual content`

      const messages = parseIMessageChat(content)

      expect(messages).toHaveLength(1)
      expect(messages[0]?.sender).toBe('Jane')
    })

    it('assigns sequential IDs', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
First
Apr 02, 2025  8:53:15 AM
Jane
Second
Apr 02, 2025  8:54:00 AM
Bob
Third`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.id).toBe(0)
      expect(messages[1]?.id).toBe(1)
      expect(messages[2]?.id).toBe(2)
    })

    it('sets source to imessage', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
Hello`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.source).toBe('imessage')
    })

    it('preserves raw line content', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
Hello there`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.rawLine).toContain('John')
      expect(messages[0]?.rawLine).toContain('Hello there')
    })

    it('handles multiple URLs in one message', () => {
      const content = `Apr 02, 2025  8:52:29 AM
John
Check https://example.com and https://other.com`

      const messages = parseIMessageChat(content)

      expect(messages[0]?.urls).toHaveLength(2)
      expect(messages[0]?.urls).toContain('https://example.com')
      expect(messages[0]?.urls).toContain('https://other.com')
    })
  })
})
