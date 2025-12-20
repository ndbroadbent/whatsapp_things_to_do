/**
 * Classification Prompt
 *
 * AI prompt for classifying candidate messages as activities.
 */

import type { CandidateMessage } from '../types.js'

/**
 * Format context for display. Context already includes target marked with >>>.
 */
function formatContext(candidate: CandidateMessage): string {
  if (candidate.context) {
    return candidate.context
  }
  // Fallback if no context
  return `>>> ${candidate.sender}: ${candidate.content}`
}

/**
 * Format timestamp for display in prompt.
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Build the classification prompt for a batch of candidates.
 */
export function buildClassificationPrompt(candidates: readonly CandidateMessage[]): string {
  const messagesText = candidates
    .map((candidate) => {
      const context = formatContext(candidate)
      const timestamp = formatTimestamp(candidate.timestamp)
      return `
---
ID: ${candidate.messageId} | ${timestamp}
${context}
---`
    })
    .join('\n')

  return `You are analyzing chat messages to identify "things to do" - activities, places to visit, events, trips, etc.

URLs may have [URL_META: {...}] with scraped metadata. Use this to understand what the link is about.

For each message marked with >>>, extract structured data for clustering and display.

NORMALIZATION RULES:
- Normalize action to common informal American English: tramping→hike, trekking→hike, cycling→bike, film→movie
- Strip light verbs (go, do, take, try, check out, let's) - extract the real action
- Do NOT over-normalize distinct concepts: cafe≠restaurant, diner≠restaurant, bar≠restaurant
- Preserve original casing in all fields

CATEGORIES: restaurant, cafe, bar, hike, nature, beach, trip, hotel, event, concert, museum, entertainment, adventure, family, errand, appointment, other

FOCUS ON:
- Suggestions to visit places (restaurants, beaches, parks, cities)
- Activities to try (hiking, kayaking, concerts, shows)
- Travel plans (trips, hotels, Airbnb)
- Events to attend (festivals, markets, movies)
- Experiences to have ("we should try...", "let's go to...")

IGNORE:
- Mundane tasks (groceries, cleaning, work)
- Past events (things already done)
- Vague statements without actionable suggestions
- Just sharing links without suggesting to go/do something
- Romantic/intimate invitations, adult content, private relationship moments
- Generic routine activities without venue ("go to a coffee shop") - but DO include unique experiences ("go kayaking")

${messagesText}

Respond with JSON array (short keys to save tokens):
\`\`\`json
[
  {
    "msg": <message_id>,
    "is_act": true/false,
    "title": "<human-readable activity description, under 100 chars>",
    "score": <0.0=errand to 1.0=fun>,
    "cat": "<category>",
    "conf": <0.0-1.0 confidence>,
    "gen": <true if generic activity, no specific name/URL/compound>,
    "com": <true if JSON fully captures info, false if lossy (compound activities, complex refs)>,
    "act": "<normalized action: hike, eat, watch, etc.>",
    "act_orig": "<original action word before normalization>",
    "obj": "<normalized object: movie, restaurant, etc.>",
    "obj_orig": "<original object word>",
    "venue": "<venue/place name: Coffee Lab, Kazuya, etc.>",
    "city": "<city name (Queenstown, Auckland, etc.)>",
    "state": "<state/region>",
    "country": "<country>"
  }
]
\`\`\`

EXAMPLES:
- "Go tramping in Queenstown" → act:"hike", act_orig:"tramping", city:"Queenstown", country:"New Zealand", gen:false, com:true
- "Watch a movie" → act:"watch", obj:"movie", gen:true, com:true
- "Go to Coffee Lab" → act:"visit", loc:"Coffee Lab", gen:false, com:true
- "Go to Iceland and see the aurora" → act:"travel", obj:"aurora", country:"Iceland", gen:false, com:false (compound, lossy)
- "Buy a watch or scotch" → act:"buy", obj:"gift", gen:false, com:false (compound, lossy)

Include ALL messages in response.`
}

export interface ParsedClassification {
  msg: number
  is_act: boolean
  title: string | null
  score: number
  cat: string
  conf: number
  gen: boolean
  com: boolean
  act: string | null
  act_orig: string | null
  obj: string | null
  obj_orig: string | null
  venue: string | null
  city: string | null
  state: string | null
  country: string | null
}

function extractJsonFromResponse(response: string): string {
  // Try to extract JSON from response (might be wrapped in ```json```)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch?.[1]) {
    return jsonMatch[1]
  }
  // Try to find JSON array directly
  const arrayMatch = response.match(/\[[\s\S]*\]/)
  if (!arrayMatch) {
    throw new Error('Could not find JSON array in response')
  }
  return arrayMatch[0]
}

function parseString(val: unknown): string | null {
  return typeof val === 'string' && val.trim() ? val : null
}

function parseNumber(val: unknown, fallback: number): number {
  return typeof val === 'number' ? Math.max(0, Math.min(1, val)) : fallback
}

function parseBoolean(val: unknown, fallback: boolean): boolean {
  return typeof val === 'boolean' ? val : fallback
}

function parseItem(obj: Record<string, unknown>): ParsedClassification {
  return {
    msg: typeof obj.msg === 'number' ? obj.msg : 0,
    is_act: parseBoolean(obj.is_act, false),
    title: parseString(obj.title),
    score: parseNumber(obj.score, 0.5),
    cat: typeof obj.cat === 'string' ? obj.cat : 'other',
    conf: parseNumber(obj.conf, 0.5),
    gen: parseBoolean(obj.gen, true),
    com: parseBoolean(obj.com, true),
    act: parseString(obj.act),
    act_orig: parseString(obj.act_orig),
    obj: parseString(obj.obj),
    obj_orig: parseString(obj.obj_orig),
    venue: parseString(obj.venue),
    city: parseString(obj.city),
    state: parseString(obj.state),
    country: parseString(obj.country)
  }
}

/**
 * Parse the classification response from the AI.
 * @param response Raw AI response text
 * @param expectedIds Optional array of message IDs - at least one must match
 */
export function parseClassificationResponse(
  response: string,
  expectedIds?: readonly number[]
): ParsedClassification[] {
  const jsonStr = extractJsonFromResponse(response)
  const parsed = JSON.parse(jsonStr) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array')
  }

  if (parsed.length === 0) {
    throw new Error('Response array is empty')
  }

  const results = parsed.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Array item is not an object')
    }
    return parseItem(item as Record<string, unknown>)
  })

  // Validate at least one msg matches expected
  if (expectedIds && expectedIds.length > 0) {
    const expectedSet = new Set(expectedIds)
    const hasMatch = results.some((r) => expectedSet.has(r.msg))
    if (!hasMatch) {
      throw new Error(
        `AI response contains no matching message IDs. Expected: [${expectedIds.join(', ')}], got: [${results.map((r) => r.msg).join(', ')}]`
      )
    }
  }

  return results
}
