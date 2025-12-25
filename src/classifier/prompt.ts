/**
 * Classification Prompt
 *
 * AI prompt for classifying candidate messages as activities.
 * Includes URL metadata enrichment for better context.
 */

import { VALID_CATEGORIES } from '../categories'
import type { ScrapedMetadata } from '../scraper/types'
import type { CandidateMessage } from '../types'

/** URL regex - matches http/https URLs */
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g

/**
 * Format scraped metadata as compact JSON for injection.
 * Only includes non-null fields to minimize prompt tokens.
 * If the final URL differs from the original, includes redirect_url (truncated to 200 chars).
 */
function formatMetadataJson(metadata: ScrapedMetadata, originalUrl: string): string {
  const obj: Record<string, unknown> = {}
  if (metadata.title) obj.title = metadata.title
  if (metadata.description) obj.description = metadata.description.slice(0, 200)
  if (metadata.creator) obj.creator = metadata.creator
  if (metadata.categories?.length) obj.categories = metadata.categories
  if (metadata.canonicalUrl && metadata.canonicalUrl !== originalUrl) {
    obj.redirect_url = metadata.canonicalUrl.slice(0, 200)
  }
  return JSON.stringify(obj)
}

/**
 * Inject metadata JSON after each URL in text.
 * Returns the enriched text with metadata on lines after URLs.
 */
export function injectUrlMetadataIntoText(
  text: string,
  metadataMap: Map<string, ScrapedMetadata>
): string {
  // Find all URLs and their positions
  const urlMatches = [...text.matchAll(URL_REGEX)]
  if (urlMatches.length === 0) return text

  // Build result by processing URLs in reverse order (to preserve positions)
  let result = text
  for (let i = urlMatches.length - 1; i >= 0; i--) {
    const match = urlMatches[i]
    if (!match || match.index === undefined) continue

    const url = match[0]
    const metadata = metadataMap.get(url)
    if (!metadata) continue

    const insertPos = match.index + url.length
    const json = formatMetadataJson(metadata, url)
    result = `${result.slice(0, insertPos)}\n[URL_META: ${json}]${result.slice(insertPos)}`
  }

  return result
}

/**
 * Format candidate with surrounding context for the classifier prompt.
 * Format: context before, then >>> target message, then context after.
 * Optionally enriches URLs with scraped metadata.
 */
function formatCandidateWithContext(
  candidate: CandidateMessage,
  metadataMap?: Map<string, ScrapedMetadata>
): string {
  const parts: string[] = []

  // Context before the target message
  if (candidate.contextBefore.length > 0) {
    parts.push(candidate.contextBefore.join('\n'))
  }

  // The target message (marked with >>>)
  parts.push(`>>> ${candidate.sender}: ${candidate.content}`)

  // Context after the target message
  if (candidate.contextAfter.length > 0) {
    parts.push(candidate.contextAfter.join('\n'))
  }

  let result = parts.join('\n')

  // Enrich URLs with scraped metadata
  if (metadataMap && metadataMap.size > 0) {
    result = injectUrlMetadataIntoText(result, metadataMap)
  }

  return result
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
  /** URL metadata map for enriching context - optional */
  readonly urlMetadata?: Map<string, ScrapedMetadata> | undefined
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
      const formatted = formatCandidateWithContext(candidate, context.urlMetadata)
      const timestamp = formatTimestamp(candidate.timestamp)
      const typeTag = candidate.candidateType === 'agreement' ? ' [AGREE]' : ''
      return `
---
ID: ${candidate.messageId}${typeTag} | ${timestamp}
${formatted}
---`
    })
    .join('\n')

  const timezoneInfo = context.timezone ? `\nTimezone: ${context.timezone}` : ''
  const userContext = `
USER CONTEXT:
Home country: ${context.homeCountry}${timezoneInfo}
`

  return `GOAL: Extract "things to do" from chat history - activities, places, and plans worth putting on a map or list.
${userContext}

WHY THESE MESSAGES:
You're seeing messages pre-filtered by heuristics (regex patterns like "let's go", "we should try") and semantic search (embeddings). We intentionally cast a wide net - you'll see some false positives. Your job is to identify the real activities worth saving.

Messages marked >>> are candidates. Use surrounding context to understand what they refer to.

[AGREE] = agreement/enthusiasm ("sounds great!", "I'm keen") rather than a direct suggestion. For these, the activity is usually in the surrounding context - extract it from there. If context has no clear activity, skip it.

URLs may have [URL_META: {...}] with scraped metadata - use this to understand what links are about.

INCLUDE (output these):
- Named places: restaurants, cafes, food trucks, bars, venues, parks, trails
- Specific activities: hiking, kayaking, concerts, movies, shows
- Travel plans: trips, destinations, hotels, Airbnb
- Events: festivals, markets, concerts, exhibitions
- Things to do: hobbies, experiences, skills, sports, games
- Generic but actionable: "Let's go to a cafe" (specific type of place)

SKIP (don't output):
- Vague: "wanna go out?", "do something fun", "go somewhere"
- Logistics: "leave at 3:50pm", "skip the nachos"
- Questions: "where should we go?"
- Links without clear discussion about visiting/attending
- Errands: groceries, vet, mechanic, cleaning
- Work/appointments/chores
- Romantic/intimate, adult content
- Sad or stressful: funerals, hospitals, work deadlines, financial worries
- Sensitive: potential secrets, embarrassing messages, offensive content, or illegal activities
- Unclear references: "go there again" (where?), "check it out" (what?)

MESSAGES:
${messagesText}

OUTPUT FORMAT:
Return JSON array with ONLY activities worth saving. Skip non-activities entirely. Return [] if none found.

\`\`\`json
[
  {
    "msg": <message_id>,
    "title": "<activity description, under 100 chars, fix any typos (e.g., 'ballon'→'balloon')>",
    "fun": <0.0-1.0 how fun/enjoyable>,
    "int": <0.0-1.0 how interesting/unique>,
    "cat": "<category>",
    "conf": <0.0-1.0 your confidence>,
    "gen": <true if generic, no specific venue/URL>,
    "com": <true if compound/complex activity that one JSON object can't fully represent>,
    "act": "<normalized action: go, hike, eat, watch, play, visit, etc. (always required)>",
    "act_orig": "<original action word>",
    "obj": "<normalized object: movie, restaurant>",
    "obj_orig": "<original object word>",
    "venue": "<name of place/restaurant/business/tour operator/etc. - extract from URL_META title if available>",
    "city": "<city>",
    "region": "<state/province>",
    "country": "<country>",
    "kw": ["<keyword1>", "<keyword2>", "<keyword3>"]
  }
]
\`\`\`

KEYWORDS (kw): Include up to 3 keywords for stock photo search. Must be DIFFERENT from act/obj/venue. Include:
- Location-specific details: "hot air balloon" + Turkey → ["cappadocia", "sunrise", "fairy chimneys"]
- Disambiguation: "watch play" → ["theatre", "stage", "actors"] (not playground)
- DO NOT include any generic terms that may dilute the search query. For example, "play paintball" is a much better query WITHOUT generic keywords like "action, game, team" (which return images of football and basketball.) Include no keywords at all if the act/obj/venue are already specific.

LOCATION: Fill city/region/country if explicitly mentioned or obvious from context. For ambiguous names (e.g., "Omaha"), assume the user's home country. Venue must be a specific place and not a general region.

CATEGORIES: ${VALID_CATEGORIES.join(', ')}

NORMALIZATION: tramping→hike, cycling→bike, film→movie. But keep distinct: cafe≠restaurant, bar≠restaurant.

EXAMPLES:
- "Go tramping in Queenstown" → act:"hike", city:"Queenstown", gen:false
- "Watch a movie" → act:"watch", obj:"movie", gen:true
- "Go to Coffee Lab" → act:"visit", venue:"Coffee Lab", gen:false
- "Let's visit Omaha" (user in NZ) → city:"Omaha", country:"New Zealand"
- "Go to Iceland and see the aurora" → act:"travel", country:"Iceland", com:true (two activities: travel + aurora viewing)

COMPOUND vs MULTIPLE: For com:true, still emit ONE object - it just flags that the JSON is lossy so that we prevent activity aggregation errors. But if a message lists truly separate activities ("Try Kazuya, also check out the Botanic Gardens"), emit multiple objects.`
}

export interface ParsedClassification {
  msg: number
  title: string | null
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
  /** 3 keywords for stock photo search (different from act/obj/venue) */
  kw: string[]
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

function parseStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return []
  return val.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function parseItem(obj: Record<string, unknown>): ParsedClassification {
  return {
    msg: parseNumber(obj.msg, 0, false), // msg is an ID, not clamped to 0-1
    title: parseString(obj.title),
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
    country: parseString(obj.country),
    kw: parseStringArray(obj.kw)
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

  // Empty array is valid - means no activities found
  if (parsed.length === 0) {
    return []
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
