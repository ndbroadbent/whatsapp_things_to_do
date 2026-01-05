/**
 * Images Schema Integration Test
 *
 * Tests that the classifier produces output matching the IMAGES.md specification.
 * Uses FixtureCache to record/replay AI API responses.
 *
 * Each test case corresponds to an example from project/project_docs/IMAGES.md.
 * We pass CandidateMessage objects directly to the classifier - no heuristic extraction.
 *
 * Test data is based on real WhatsApp chat messages to simulate realistic input.
 *
 * The new image schema is:
 * - stock: REQUIRED - stock photo search query (AI-generated, always present)
 * - mediaKey: optional - key for media library lookup (e.g., "hiking", "restaurant")
 * - preferStock: optional boolean - true = stock query more specific, false = media library preferred
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCandidate } from '../test-support'
import { FixtureCache } from '../test-support/fixture-cache'
import type { ContextMessage } from '../types'
import { classifyMessages } from './index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '../../tests/fixtures/classifier')

// Helper to create realistic context messages
function ctx(id: number, sender: string, content: string, timestamp: string): ContextMessage {
  return { id, sender, content, timestamp: new Date(timestamp) }
}

describe('Classifier Images Schema (IMAGES.md Examples)', () => {
  let cache: FixtureCache

  beforeAll(async () => {
    cache = new FixtureCache(join(FIXTURES_DIR, 'images-schema.json.gz'))
    await cache.load()
  })

  afterAll(async () => {
    await cache.save()
  })

  const apiKey = process.env.OPENAI_API_KEY || 'dummy-key-for-cached-tests'
  const classifierConfig = {
    provider: 'openai' as const,
    apiKey,
    homeCountry: 'New Zealand',
    timezone: 'Pacific/Auckland'
  }

  // 1. City as destination - based on real chat about Paris trip
  it('classifies city as destination correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 1001,
      content: "let's go to Paris next year",
      sender: 'John Doe',
      timestamp: new Date('2024-06-15T10:30:00.000Z'),
      contextBefore: [
        ctx(999, 'Alice Smith', 'What should we do for our anniversary?', '2024-06-15T10:28:00'),
        ctx(1000, 'John Doe', 'I was thinking we could go somewhere special', '2024-06-15T10:29:00')
      ],
      contextAfter: [
        ctx(1002, 'Alice Smith', 'Yes! I would love that', '2024-06-15T10:31:00'),
        ctx(1003, 'John Doe', 'We can see the Eiffel Tower', '2024-06-15T10:32:00')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: city:"Paris", country:"France", cat:"travel"
    // image: { stock: "paris france eiffel tower", mediaKey: null, preferStock: true }
    expect(activity.category).toBe('travel')
    expect(activity.country).toBe('France')
    // Paris should be identified either as city or placeName
    expect(activity.city === 'Paris' || activity.placeName === 'Paris').toBe(true)
    // No wikiName or placeQuery for a city destination
    expect(activity.placeQuery).toBeNull()
    expect(activity.wikiName).toBeNull()
    // stock should exist and be specific to Paris
    expect(activity.image.stock).toMatch(/paris|france|eiffel/i)
    // preferStock should be true for location-specific image
    expect(activity.image.preferStock).toBe(true)
  })

  // 2. Canonical place - based on real trip to Bay of Islands (similar to Waiheke)
  it('classifies canonical place correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 3300,
      content: 'oh yeah how about a trip to Waiheke island',
      sender: 'John Doe',
      timestamp: new Date('2024-04-05T09:15:00.000Z'),
      contextBefore: [
        ctx(3298, 'Alice Smith', 'What should we do this weekend?', '2024-04-05T09:13:00'),
        ctx(3299, 'John Doe', 'We could take the ferry somewhere', '2024-04-05T09:14:00')
      ],
      contextAfter: [
        ctx(3301, 'Alice Smith', 'Oh yes! Wine tasting?', '2024-04-05T09:16:00'),
        ctx(3302, 'John Doe', 'And the beach', '2024-04-05T09:17:00')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: placeName:"Waiheke Island", region:"Auckland", country:"New Zealand", cat:"travel"
    // image: { stock: "waiheke ocean beach vineyard", mediaKey: "island", preferStock: true }
    expect(activity.category).toBe('travel')
    expect(activity.placeName).toContain('Waiheke')
    expect(activity.country).toBe('New Zealand')
    // placeQuery should be null (placeName takes precedence)
    expect(activity.placeQuery).toBeNull()
    // stock should be specific to Waiheke
    expect(activity.image.stock).toMatch(/waiheke|ocean|beach|island|vineyard|wine/i)
    // preferStock true - stock query is more specific than generic "island"
    expect(activity.image.preferStock).toBe(true)
    // mediaKey could be "island" or "beach" or null
  })

  // 3. Business venue - based on real Blood on the Clocktower at Dice Goblin
  it('classifies business venue correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 3100,
      content: "they're going to to play board games at Dice Goblin. it was fun last time",
      sender: 'John Doe',
      timestamp: new Date('2024-03-18T22:06:00.000Z'),
      contextBefore: [
        ctx(3098, 'Alice Smith', 'Any plans for Saturday?', '2024-03-18T22:04:00'),
        ctx(3099, 'John Doe', 'There is a game night happening', '2024-03-18T22:05:00')
      ],
      contextAfter: [
        ctx(3101, 'Alice Smith', 'Sounds fun!', '2024-03-18T22:07:00'),
        ctx(3102, 'John Doe', 'They play Blood on the Clocktower', '2024-03-18T22:08:00')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: placeQuery:"Dice Goblin Auckland", city:"Auckland", country:"New Zealand", cat:"gaming"
    // image: { stock: "board game meetup people", mediaKey: "board game" }
    expect(activity.category).toBe('gaming')
    expect(activity.placeQuery).toContain('Dice Goblin')
    // placeName should be null (placeQuery for businesses)
    expect(activity.placeName).toBeNull()
    // stock should be about board games
    expect(activity.image.stock).toMatch(/board|game|tabletop|meetup/i)
    // mediaKey should be a gaming-related term
    expect(activity.image.mediaKey).toMatch(/board|game/i)
    // preferStock can be either true or false - AI decides based on specificity
  })

  // 4. Thing with venue - based on real Infected Mushroom concert message
  it('classifies thing with venue correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 3451,
      content: 'We are going to see Infected Mushroom! They are coming to Auckland',
      sender: 'John Doe',
      timestamp: new Date('2024-04-13T02:35:13.000Z'),
      contextBefore: [
        ctx(3448, 'Alice Smith', '\u200evideo omitted', '2024-04-12T23:45:26'),
        ctx(3449, 'Alice Smith', '\u200evideo omitted', '2024-04-13T00:23:59'),
        ctx(3450, 'John Doe', 'yay!', '2024-04-13T00:24:19')
      ],
      contextAfter: [
        ctx(3452, 'John Doe', 'I bought tickets', '2024-04-13T02:35:18'),
        ctx(3453, 'Alice Smith', 'Yay', '2024-04-13T02:35:36'),
        ctx(3454, 'Alice Smith', 'When?', '2024-04-13T02:35:39'),
        ctx(3455, 'John Doe', 'June', '2024-04-13T02:35:44')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: wikiName:"Infected Mushroom", city:"Auckland", country:"New Zealand", cat:"music"
    // image: { stock: "psytrance rave edm concert", mediaKey: "concert", preferStock: true }
    expect(activity.category).toBe('music')
    expect(activity.wikiName).toBe('Infected Mushroom')
    expect(activity.city).toBe('Auckland')
    // placeName/placeQuery should be null (wikiName takes precedence)
    expect(activity.placeName).toBeNull()
    expect(activity.placeQuery).toBeNull()
    // stock should be about psytrance/rave/concert
    expect(activity.image.stock).toMatch(/psytrance|rave|edm|concert|electronic/i)
    // preferStock true - "psytrance rave" is more specific than generic "concert"
    expect(activity.image.preferStock).toBe(true)
  })

  // 5. Object-based activity - geothermal park in Rotorua
  it('classifies object-based activity correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 2050,
      content: 'We should visit a geothermal park in Rotorua',
      sender: 'John Doe',
      timestamp: new Date('2024-02-20T14:30:00.000Z'),
      contextBefore: [
        ctx(2048, 'Alice Smith', 'We should plan a trip somewhere', '2024-02-20T14:28:00'),
        ctx(2049, 'John Doe', 'How about Rotorua?', '2024-02-20T14:29:00')
      ],
      contextAfter: [
        ctx(2051, 'Alice Smith', 'The hot pools!', '2024-02-20T14:31:00'),
        ctx(2052, 'John Doe', 'Yes and the mud baths', '2024-02-20T14:32:00')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: city:"Rotorua", country:"New Zealand", cat:"nature"
    // image: { stock: "mud pools geyser geothermal rotorua", mediaKey: "geothermal", preferStock: true }
    expect(activity.category).toBe('nature')
    expect(activity.city).toBe('Rotorua')
    expect(activity.country).toBe('New Zealand')
    // placeName/placeQuery should be null (object-based activity)
    expect(activity.placeName).toBeNull()
    expect(activity.placeQuery).toBeNull()
    // stock should be about geothermal features
    expect(activity.image.stock).toMatch(/geothermal|mud|geyser|rotorua/i)
    // preferStock true - "mud pools geyser rotorua" is more specific than generic "geothermal"
    expect(activity.image.preferStock).toBe(true)
  })

  // 6. Movie with link - based on real Late Night with the Devil movie discussion
  it('classifies movie with link correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 3407,
      content: "let's watch The Matrix",
      sender: 'Alice Smith',
      timestamp: new Date('2024-04-08T20:15:00.000Z'),
      contextBefore: [
        ctx(3405, 'John Doe', 'What should we watch tonight?', '2024-04-08T20:13:00'),
        ctx(3406, 'Alice Smith', 'Something classic?', '2024-04-08T20:14:00')
      ],
      contextAfter: [
        ctx(3408, 'John Doe', 'Good choice!', '2024-04-08T20:16:00'),
        ctx(3409, 'Alice Smith', "I haven't seen it in years", '2024-04-08T20:17:00')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: cat:"entertainment", link:{type:"movie", query:"The Matrix"}
    // image: { stock: "movie night popcorn home", mediaKey: "movie night", preferStock: false }
    expect(activity.category).toBe('entertainment')
    // No location fields
    expect(activity.placeName).toBeNull()
    expect(activity.placeQuery).toBeNull()
    expect(activity.wikiName).toBeNull()
    // stock should be about movie night
    expect(activity.image.stock).toMatch(/movie|night|popcorn|film/i)
    // mediaKey could be "movie night", "cinema", etc.
    // preferStock is a hint - AI can reasonably choose either
    expect(typeof activity.image.preferStock).toBe('boolean')
    // link hints
    expect(activity.link).toBeDefined()
    expect(activity.link?.type).toBe('movie')
    expect(activity.link?.query).toMatch(/matrix/i)
  })

  // 7. Non-place object - going to the theatre
  it('classifies non-place object correctly', { timeout: 120000 }, async () => {
    const candidate = createCandidate({
      messageId: 2100,
      content: 'We should go to a play or something',
      sender: 'Alice Smith',
      timestamp: new Date('2024-03-01T18:00:00.000Z'),
      contextBefore: [
        ctx(2098, 'John Doe', 'Any plans for this weekend?', '2024-03-01T17:58:00'),
        ctx(2099, 'Alice Smith', 'We could do something', '2024-03-01T17:59:00')
      ],
      contextAfter: [
        ctx(2101, 'John Doe', 'What is on?', '2024-03-01T18:01:00'),
        ctx(2102, 'Alice Smith', 'Let me check', '2024-03-01T18:02:00')
      ]
    })

    const result = await classifyMessages([candidate], classifierConfig, cache)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error.message)

    const activity = result.value[0]
    expect(activity).toBeDefined()
    if (!activity) throw new Error('No activity')

    // Expected: cat:"entertainment", image: { stock: "theatre stage performance", mediaKey: "theatre", preferStock: false }
    expect(activity.category).toBeOneOf(['entertainment', 'arts'])
    // No location fields
    expect(activity.placeName).toBeNull()
    expect(activity.placeQuery).toBeNull()
    expect(activity.wikiName).toBeNull()
    // stock should be about theatre
    expect(activity.image.stock).toMatch(/theatre|stage|performance|audience|play/i)
    // mediaKey should be theatre-related
    expect(activity.image.mediaKey).toMatch(/theatre|stage|performance/i)
    // preferStock is a hint - AI can reasonably choose either
    expect(typeof activity.image.preferStock).toBe('boolean')
  })
})
