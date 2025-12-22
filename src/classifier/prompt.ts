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
 * User context for classification.
 */
export interface ClassificationContext {
  /** User's home country (e.g., "New Zealand") - REQUIRED for location disambiguation */
  readonly homeCountry: string
  /** User's timezone (e.g., "Pacific/Auckland") - optional, helps with temporal context */
  readonly timezone?: string | undefined
}

/**
 * Build the classification prompt for a batch of candidates.
 */
export function buildClassificationPrompt(
  candidates: readonly CandidateMessage[],
  context: ClassificationContext
): string {
  if (!context.homeCountry) {
    throw new Error('ClassificationContext.homeCountry is required')
  }

  const messagesText = candidates
    .map((candidate) => {
      const ctx = formatContext(candidate)
      const timestamp = formatTimestamp(candidate.timestamp)
      return `
---
ID: ${candidate.messageId} | ${timestamp}
${ctx}
---`
    })
    .join('\n')

  const timezoneInfo = context.timezone ? `\nTimezone: ${context.timezone}` : ''
  const userContext = `
USER CONTEXT:
Home country: ${context.homeCountry}${timezoneInfo}
`

  return `PURPOSE: We are building a "things to do" map/list from a user's chat history. The goal is to surface specific activity suggestions and places they talked about wanting to visit - things they can actually act on later. We want to show pins on a map and a list of actionable ideas.
${userContext}

For each message marked with >>>, classify whether it's a mappable/actionable activity suggestion.

URLs may have [URL_META: {...}] with scraped metadata. Use this to understand what the link is about.

NORMALIZATION RULES:
- Normalize action to common informal American English: tramping→hike, trekking→hike, cycling→bike, film→movie
- Strip light verbs (go, do, take, try, check out, let's) - extract the real action
- Do NOT over-normalize distinct concepts: cafe≠restaurant, diner≠restaurant, bar≠restaurant
- Preserve original casing in all fields

CATEGORIES: restaurant, cafe, bar, hike, nature, beach, trip, hotel, event, concert, museum, entertainment, adventure, sports, gaming, art, skills, experiences, hobbies, family, social, shopping, fitness, health, food, home, pets, work, errand, appointment, other

CRITICAL: The "other" category is a last resort. If you can't fit something into a specific category, it's probably not a real activity suggestion. Set is_act=false unless there's a clear, specific, actionable activity or place to visit.

is_act=true ONLY for specific, actionable suggestions:
- Named places (restaurants, cafes, venues, parks, cities, countries)
- Specific activities (hiking, kayaking, concerts, movies, shows)
- Travel plans with destinations (trips, hotels, Airbnb)
- Events to attend (festivals, markets, concerts)
- Generic but specific activities: "Let's go to a cafe" (specific type of place)

is_act=false for:
- Vague suggestions: "wanna go out?", "do something fun", "go somewhere"
- Logistics: "leave at 3:50pm", "skip the nachos"
- Questions without suggestions: "where should we go?"
- Just sharing links without clear suggestion to visit
- Mundane errands (groceries, cleaning, vet, mechanic)
- Work tasks, appointments, chores
- Past events (things already done)
- Romantic/intimate invitations, adult content
- Pet care, household routines
- Context-dependent references: "go there again" (where?), "check it out" (what?)
- Bare Google Maps links without accompanying suggestion text

${messagesText}

LOCATION FIELDS:
- Only fill city/region/country if EXPLICITLY mentioned in the message
- For ambiguous locations (e.g., "Omaha"), assume user's home country unless context suggests otherwise
- region = state, province, prefecture, or region name

Respond with JSON array (short keys to save tokens):
\`\`\`json
[
  {
    "msg": <message_id>,
    "is_act": true/false,
    "title": "<human-readable activity description, under 100 chars>",
    "score": <0.0=errand/chore, 1.0=fun activity - used to filter out mundane tasks>,
    "fun": <0.0-1.0 how fun/enjoyable? 0=boring, 1=exciting>,
    "int": <0.0-1.0 how interesting/unique? 0=common, 1=rare/novel>,
    "cat": "<category>",
    "conf": <0.0-1.0 confidence>,
    "gen": <true if generic activity, no specific name/URL>,
    "com": <true if a compound/complex activity that JSON can't fully capture, false if the JSON is lossless>,
    "act": "<normalized action: hike, eat, watch, etc.>",
    "act_orig": "<original action word before normalization>",
    "obj": "<normalized object: movie, restaurant, etc.>",
    "obj_orig": "<original object word>",
    "venue": "<venue/place name: Coffee Lab, Kazuya, etc.>",
    "city": "<city name>",
    "region": "<state/province/prefecture/region>",
    "country": "<country>"
  }
]
\`\`\`

EXAMPLES:
- "Go tramping in Queenstown" → act:"hike", act_orig:"tramping", city:"Queenstown", gen:false, com:false
- "Watch a movie" → act:"watch", obj:"movie", gen:true, com:false
- "Go to Coffee Lab" → act:"visit", venue:"Coffee Lab", gen:false, com:false
- "Let's visit Omaha" (user in NZ) → city:"Omaha", country:"New Zealand", gen:false, com:false
- "Go to Iceland and see the aurora" → act:"travel", obj:"aurora", country:"Iceland", gen:false, com:true (compound)

Include ALL messages in response.`
}

export interface ParsedClassification {
  msg: number
  is_act: boolean
  title: string | null
  /** Is this an errand (0) or a fun activity (1)? */
  score: number
  /** How fun/enjoyable is this activity? 0=boring, 1=exciting */
  fun: number
  /** How interesting/unique is this activity? 0=common/mundane, 1=rare/novel */
  int: number
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
  region: string | null
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

function parseNumber(val: unknown, fallback: number, clamp = true): number {
  if (typeof val === 'number') {
    return clamp ? Math.max(0, Math.min(1, val)) : val
  }
  if (typeof val === 'string') {
    const parsed = Number.parseFloat(val)
    if (!Number.isNaN(parsed)) {
      return clamp ? Math.max(0, Math.min(1, parsed)) : parsed
    }
  }
  return fallback
}

function parseBoolean(val: unknown, fallback: boolean): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true
    if (val.toLowerCase() === 'false') return false
  }
  return fallback
}

function parseItem(obj: Record<string, unknown>): ParsedClassification {
  return {
    msg: parseNumber(obj.msg, 0, false), // msg is an ID, not clamped to 0-1
    is_act: parseBoolean(obj.is_act, false),
    title: parseString(obj.title),
    score: parseNumber(obj.score, 0.5),
    fun: parseNumber(obj.fun, 0.5),
    int: parseNumber(obj.int, 0.5),
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
    region: parseString(obj.region),
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
