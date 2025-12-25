/**
 * Classification Prompt
 *
 * AI prompt for classifying candidate messages as activities.
 * Split into two prompt types for better accuracy with smaller models:
 * - Suggestion prompt: For regular candidates where activity is in the >>> message
 * - Agreement prompt: For [AGREE] candidates pointing to earlier messages
 */

import { VALID_CATEGORIES } from '../categories'
import type { ScrapedMetadata } from '../scraper/types'
import type { CandidateMessage, ContextMessage } from '../types'

// Re-export parsing types and functions
export { type ParsedClassification, parseClassificationResponse } from './response-parser'

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
 * Format a context message as a string for the AI prompt.
 * Example: "[2024-10-11T13:34] John: Hello world"
 */
function formatContextMessage(msg: ContextMessage): string {
  const iso = msg.timestamp.toISOString().slice(0, 16) // "2024-10-11T13:34"
  return `[${iso}] ${msg.sender}: ${msg.content}`
}

/**
 * Format candidate with surrounding context for the classifier prompt.
 * For suggestions: includes both before and after context.
 * For agreements: only includes before context (what they're agreeing to).
 */
function formatCandidateWithContext(
  candidate: CandidateMessage,
  metadataMap?: Map<string, ScrapedMetadata>,
  includeAfterContext = true
): string {
  const parts: string[] = []

  // Context before the target message
  if (candidate.contextBefore.length > 0) {
    parts.push(candidate.contextBefore.map(formatContextMessage).join('\n'))
  }

  // The target message (marked with >>>)
  parts.push(`>>> ${candidate.sender}: ${candidate.content}`)

  // Context after the target message (only for suggestions)
  if (includeAfterContext && candidate.contextAfter.length > 0) {
    parts.push(candidate.contextAfter.map(formatContextMessage).join('\n'))
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

// ============================================================================
// SHARED PROMPT SECTIONS
// ============================================================================

function buildUserContextSection(context: ClassificationContext): string {
  const timezoneInfo = context.timezone ? `\nTimezone: ${context.timezone}` : ''
  return `USER CONTEXT:
Home country: ${context.homeCountry}${timezoneInfo}`
}

const SHARED_INCLUDE_RULES = `INCLUDE (output these):
- Named places: restaurants, cafes, food trucks, bars, venues, parks, trails
- Specific activities: hiking, kayaking, concerts, movies, shows
- Travel plans: trips, destinations, hotels, Airbnb
- Events: festivals, markets, concerts, exhibitions
- Things to do: hobbies, experiences, skills, sports, games
- Generic but actionable: "Let's go to a cafe" (specific type of place)`

const SHARED_SKIP_RULES = `SKIP (don't output):
- Vague: "wanna go out?", "do something fun", "go somewhere"
- Logistics: "leave at 3:50pm", "skip the nachos"
- Questions: "where should we go?"
- Links without clear discussion about visiting/attending
- Errands: groceries, vet, mechanic, cleaning
- Work/appointments/chores
- Romantic/intimate, adult content
- Sad or stressful: funerals, hospitals, work deadlines, financial worries
- Sensitive: potential secrets, embarrassing messages, offensive content, or illegal activities
- Unclear references: "go there again" (where?), "check it out" (what?)`

function buildJsonSchemaSection(includeOffset: boolean): string {
  const offsetField = includeOffset
    ? `    "off": <message_offset: 0 if activity is in >>> message, -1 for immediately before, -2 for two before, etc.>,\n`
    : ''

  return `OUTPUT FORMAT:
Return JSON array with ONLY activities worth saving. Skip non-activities entirely. Return [] if none found.

\`\`\`json
[
  {
    "msg": <message_id>,
${offsetField}    "title": "<activity description, under 100 chars, fix any typos (e.g., 'ballon'→'balloon')>",
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

(ALL fields are required. Use null or empty string if the field has no applicable value.)`
}

const SHARED_KEYWORDS_SECTION = `KEYWORDS (kw): Include up to 3 keywords for stock photo search. Must be DIFFERENT from act/obj/venue. Include:
- Location-specific details: "hot air balloon" + Turkey → ["cappadocia", "sunrise", "fairy chimneys"]
- Disambiguation: "watch play" → ["theatre", "stage", "actors"] (not playground)
- DO NOT include any generic terms that may dilute the search query. For example, "play paintball" is a much better query WITHOUT generic keywords like "action, game, team" (which return images of football and basketball.) Include no keywords at all if the act/obj/venue are already specific.`

function buildLocationSection(homeCountry: string): string {
  return `LOCATION: Fill city/region/country if mentioned or obvious from context. For ambiguous names (e.g., "Omaha"), assume the user's home country (${homeCountry}). Venue can only be a specific place and not a general region.`
}

const SHARED_CATEGORIES_SECTION = `CATEGORIES: ${VALID_CATEGORIES.join(', ')}
("other" should be used only as a last resort. Only use it if no other category applies.)`

const SHARED_NORMALIZATION = `NORMALIZATION: tramping→hike, cycling→bike, film→movie. But keep distinct: cafe≠restaurant, bar≠restaurant.`

const SHARED_COMPOUND_SECTION = `COMPOUND vs MULTIPLE: For com:true, still emit ONE object - it just flags that the JSON is lossy so that we prevent activity aggregation errors. If a message lists truly separate activities ("Try Kazuya, also check out the Botanic Gardens"), emit multiple objects.`

// ============================================================================
// SUGGESTION PROMPT (regular candidates)
// ============================================================================

function buildSuggestionPrompt(
  candidates: readonly CandidateMessage[],
  context: ClassificationContext
): string {
  const messagesText = candidates
    .map((candidate) => {
      const formatted = formatCandidateWithContext(candidate, context.urlMetadata, true)
      const timestamp = formatTimestamp(candidate.timestamp)
      return `
---
ID: ${candidate.messageId} | ${timestamp}
${formatted}
---`
    })
    .join('\n')

  return `GOAL: Extract "things to do" from chat history - activities, places, and plans worth putting on a map or list.

${buildUserContextSection(context)}

WHY THESE MESSAGES:
You're seeing messages pre-filtered by heuristics (regex patterns like "let's go", "we should try") and semantic search (embeddings). We intentionally cast a wide net - you'll see some false positives. Your job is to identify the real activities worth saving.

Messages marked >>> are candidates. The activity MUST come from the >>> candidate message itself, not from surrounding context.

CRITICAL: Only extract activities that are IN the >>> message itself. Context is for understanding intent, not for finding activities.
- WRONG: >>> "Just having coffee" with context "Paintball. Saturday?" → extracting paintball (activity is in context, not candidate)
- RIGHT: >>> "Just having coffee" → skip (not an activity suggestion)
- RIGHT: >>> "Paintball. Saturday?" → extract paintball (activity is in the candidate itself)

URLs may have [URL_META: {...}] with scraped metadata - use this to understand what links are about.

${SHARED_INCLUDE_RULES}

${SHARED_SKIP_RULES}

${buildJsonSchemaSection(false)}

${SHARED_KEYWORDS_SECTION}

${buildLocationSection(context.homeCountry)}

${SHARED_CATEGORIES_SECTION}

${SHARED_NORMALIZATION}

EXAMPLES:
- "Go tramping in Queenstown" → act:"hike", city:"Queenstown", gen:false
- "Watch a movie" → act:"watch", obj:"movie", gen:true
- "Go to Coffee Lab" → act:"visit", venue:"Coffee Lab", gen:false
- "Let's visit Omaha" (user in NZ) → city:"Omaha", country:"New Zealand"
- "Go to Iceland and see the aurora" → act:"travel", country:"Iceland", com:true (two activities: travel + aurora viewing)

${SHARED_COMPOUND_SECTION}

MESSAGES:
${messagesText}
`
}

// ============================================================================
// AGREEMENT PROMPT ([AGREE] candidates)
// ============================================================================

function buildAgreementPrompt(
  candidates: readonly CandidateMessage[],
  context: ClassificationContext
): string {
  const messagesText = candidates
    .map((candidate) => {
      // Only show context BEFORE for agreements (what they're agreeing to)
      const formatted = formatCandidateWithContext(candidate, context.urlMetadata, false)
      const timestamp = formatTimestamp(candidate.timestamp)
      return `
---
ID: ${candidate.messageId} [AGREE] | ${timestamp}
${formatted}
---`
    })
    .join('\n')

  return `GOAL: Extract activities that the user is agreeing to or expressing enthusiasm about.

${buildUserContextSection(context)}

These are AGREEMENT messages - phrases like "sounds great!", "I'm keen!", "let's do it!". Your job is to find WHAT they are agreeing to by looking at the messages BEFORE the >>> candidate.

The >>> message is the agreement itself. Look at the context BEFORE it to find the activity being agreed to.

For each activity found, use:
- "msg": the ID of the >>> agreement message
- "off": negative offset pointing to where the activity is (e.g., -1 for immediately before, -2 for two messages before)

If you can't find a clear activity in the context before the agreement, skip it entirely.

URLs may have [URL_META: {...}] with scraped metadata - use this to understand what links are about.

${SHARED_INCLUDE_RULES}

${SHARED_SKIP_RULES}

${buildJsonSchemaSection(true)}

${SHARED_KEYWORDS_SECTION}

${buildLocationSection(context.homeCountry)}

${SHARED_CATEGORIES_SECTION}

${SHARED_NORMALIZATION}

EXAMPLES:
- Context: "Wanna do a whale safari?" then >>> "That sounds amazing!" → off:-1, act:"do", obj:"safari"
- Context: "Let's go hiking" then "What about Saturday?" then >>> "Perfect!" → off:-2, act:"hike"
- >>> "Sounds fun!" with no clear activity before → skip entirely

${SHARED_COMPOUND_SECTION}

MESSAGES:
${messagesText}
`
}

// ============================================================================
// PUBLIC API
// ============================================================================

export type PromptType = 'suggestion' | 'agreement'

/**
 * Build the classification prompt for a batch of candidates.
 * Automatically selects the appropriate prompt type based on candidate types.
 */
export function buildClassificationPrompt(
  candidates: readonly CandidateMessage[],
  context: ClassificationContext,
  promptType?: PromptType
): string {
  if (!context.homeCountry) {
    throw new Error('ClassificationContext.homeCountry is required')
  }

  // Auto-detect prompt type if not specified
  const type = promptType ?? detectPromptType(candidates)

  if (type === 'agreement') {
    return buildAgreementPrompt(candidates, context)
  }
  return buildSuggestionPrompt(candidates, context)
}

/**
 * Detect the prompt type based on candidates.
 * If all candidates are agreements, use agreement prompt.
 * Otherwise use suggestion prompt.
 */
function detectPromptType(candidates: readonly CandidateMessage[]): PromptType {
  if (candidates.length === 0) return 'suggestion'
  const allAgreements = candidates.every((c) => c.candidateType === 'agreement')
  return allAgreements ? 'agreement' : 'suggestion'
}

/**
 * Separate candidates into suggestion and agreement batches.
 * This allows processing them with different prompts for better accuracy.
 */
export function separateCandidatesByType(candidates: readonly CandidateMessage[]): {
  suggestions: CandidateMessage[]
  agreements: CandidateMessage[]
} {
  const suggestions: CandidateMessage[] = []
  const agreements: CandidateMessage[] = []

  for (const candidate of candidates) {
    if (candidate.candidateType === 'agreement') {
      agreements.push(candidate)
    } else {
      suggestions.push(candidate)
    }
  }

  return { suggestions, agreements }
}
