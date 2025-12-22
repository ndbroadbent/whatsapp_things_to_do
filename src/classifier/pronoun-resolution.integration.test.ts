/**
 * Pronoun Resolution Integration Test
 *
 * Tests that the classifier correctly resolves pronouns using context.
 * Uses FixtureCache to record/replay AI API responses.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { extractCandidatesByHeuristics } from '../extraction/heuristics/index'
import { parseWhatsAppChat } from '../parser/whatsapp'
import { FixtureCache } from '../test-support/fixture-cache'
import { classifyMessages } from './index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '../../tests/fixtures/classifier')

/**
 * Conversation where "her" should resolve to "Sarah".
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

describe('Classifier Pronoun Resolution', () => {
  let cache: FixtureCache

  beforeAll(async () => {
    cache = new FixtureCache(join(FIXTURES_DIR, 'pronoun-resolution.json.gz'))
    await cache.load()
  })

  afterAll(async () => {
    await cache.save()
  })

  it('should resolve "her" to "Sarah" in visit suggestion', { timeout: 120000 }, async () => {
    const messages = parseWhatsAppChat(PRONOUN_RESOLUTION_CHAT)
    const extracted = await extractCandidatesByHeuristics(messages)

    // Find the "visit her" candidate
    const visitCandidate = extracted.candidates.find((c) => c.content.includes('visit her'))
    expect(visitCandidate).toBeDefined()

    // Verify context includes "Sarah"
    expect(visitCandidate?.context).toContain('Sarah')

    if (!visitCandidate) throw new Error('visitCandidate not found')
    // Use real API key if available, otherwise use dummy (cache will provide response)
    const apiKey = process.env.OPENAI_API_KEY || 'dummy-key-for-cached-tests'

    // Classify with AI (uses cached response if available)
    const result = await classifyMessages(
      [visitCandidate],
      {
        provider: 'openai',
        apiKey,
        homeCountry: 'New Zealand',
        timezone: 'Pacific/Auckland'
      },
      cache
    )

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    expect(result.value).toMatchInlineSnapshot(`
      [
        {
          "action": null,
          "actionOriginal": null,
          "activity": "No activity — I'm busy all day today",
          "category": "other",
          "city": null,
          "confidence": 0.9,
          "country": null,
          "isActivity": false,
          "isCompound": false,
          "isGeneric": false,
          "messageId": 5,
          "object": null,
          "objectOriginal": null,
          "originalMessage": "Can we visit her on Wednesday, please?",
          "region": null,
          "sender": "Bob Jones",
          "timestamp": "2024-04-29T18:00:25.000Z",
          "venue": null,
        },
      ]
    `)
  })
})
