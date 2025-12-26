/**
 * Context Window Tests
 *
 * Rules:
 * - Minimum 280 chars before and 280 chars after
 * - Minimum 2 messages on each side
 * - Messages are chunked at parse time (≤280 chars each), no truncation in context
 * - For prior context: snap to message boundaries
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseWhatsAppChat } from '../../parser/whatsapp'
import { extractCandidatesByHeuristics } from './index'

const FIXTURES_DIR = join(__dirname, '../../../tests/fixtures')

/**
 * Conversation where "her" should resolve to "Sarah".
 * With 280 char minimum, we should get enough context.
 */
const PRONOUN_RESOLUTION_CHAT = `[4/29/24, 8:06:50 PM] Alice Smith: Oooh yum
[4/29/24, 9:58:07 PM] Alice Smith: I should call Sarah and see if we can visit
[4/29/24, 9:58:11 PM] Alice Smith: I forgot about that
[4/29/24, 9:58:26 PM] Alice Smith: maybe tomorrow after lunch time?
[4/30/24, 6:00:15 AM] Bob Jones: I'm busy all day today
[4/30/24, 6:00:25 AM] Bob Jones: Can we visit her on Wednesday, please?
[4/30/24, 9:03:07 AM] Alice Smith: Ok
[4/30/24, 9:53:34 AM] Bob Jones: The package is her
[4/30/24, 9:53:37 AM] Bob Jones: Here
[4/30/24, 9:53:43 AM] Alice Smith: Yay`

describe('Context Window', () => {
  it('should include "Sarah" in context for "visit her" message', async () => {
    const messages = parseWhatsAppChat(PRONOUN_RESOLUTION_CHAT)
    const result = await extractCandidatesByHeuristics(messages)

    const visitCandidate = result.candidates.find((c) => c.content.includes('visit her'))
    if (!visitCandidate) throw new Error('visitCandidate not found')

    // With 280 char minimum, we should reach "Sarah" (4 messages back)
    const allContext = [
      ...visitCandidate.contextBefore.map((m) => m.content),
      ...visitCandidate.contextAfter.map((m) => m.content)
    ].join('\n')
    expect(allContext).toContain('Sarah')
  })

  it('should include at least 2 messages before and after', async () => {
    const messages = parseWhatsAppChat(PRONOUN_RESOLUTION_CHAT)
    const result = await extractCandidatesByHeuristics(messages)

    const visitCandidate = result.candidates.find((c) => c.content.includes('visit her'))
    if (!visitCandidate) throw new Error('visitCandidate not found')

    expect(visitCandidate.contextBefore.length).toBeGreaterThanOrEqual(2)
    expect(visitCandidate.contextAfter.length).toBeGreaterThanOrEqual(2)
  })

  it('should preserve long messages when remainder would be too small to chunk', async () => {
    const chat = readFileSync(join(FIXTURES_DIR, 'context-window.txt'), 'utf-8')
    const messages = parseWhatsAppChat(chat)
    const result = await extractCandidatesByHeuristics(messages)

    const candidate = result.candidates.find((c) => c.content.includes('try that place'))
    if (!candidate) throw new Error('candidate not found')

    const allContext = [
      ...candidate.contextBefore.map((m) => m.content),
      ...candidate.contextAfter.map((m) => m.content)
    ].join('\n')

    // Long message about The Golden Fork is NOT chunked because remainder < 32 chars
    // All content is preserved in a single message
    expect(allContext).toContain('Golden Fork')
    expect(allContext).toContain('friends and family')
  })

  it('should get at least 280 chars of context before', async () => {
    const chat = readFileSync(join(FIXTURES_DIR, 'context-window.txt'), 'utf-8')
    const messages = parseWhatsAppChat(chat)
    const result = await extractCandidatesByHeuristics(messages)

    const candidate = result.candidates.find((c) => c.content.includes('try that place'))
    if (!candidate) throw new Error('candidate not found')

    const beforeContext = candidate.contextBefore.map((m) => m.content).join('\n')

    // Should have at least 280 chars before (excluding newlines for calculation)
    const beforeChars = beforeContext.replace(/\n/g, '').length
    expect(beforeChars).toBeGreaterThanOrEqual(280)
  })
})
