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

// Re-export parsing function (types re-exported from ./index.ts)
export { parseClassificationResponse } from './response-parser'

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
    "fun": <0.0-5.0 how fun/enjoyable>,
    "int": <0.0-5.0 how interesting/unique>,
    "cat": "<category>",

    // Location fields (top-level, for geocoding + images)
    "wikiName": "<Wikipedia topic for things like bands, board games, concepts>",
    "placeName": "<canonical named place - valid Wikipedia title (e.g., 'Waiheke Island', 'Mount Fuji')>",
    "placeQuery": "<specific named business for Google Places (e.g., 'Dice Goblin Auckland') - NOT generic searches>",
    "city": "<city name>",
    "region": "<state/province>",
    "country": "<country>",

    // Image hints (REQUIRED - stock is always required, mediaKey is optional)
    "image": {
      "stock": "<stock photo query - ALWAYS REQUIRED (e.g., 'hot air balloon cappadocia sunrise')>",
      "mediaKey": "<media library key (e.g., 'hot air balloon', 'restaurant')>",
      "preferStock": <true if stock query is more specific than generic mediaKey>
    },

    // Link hints (for generating clickable link widgets) - optional
    "link": {
      "type": "<movie|book|board_game|place|event|other>",
      "query": "<canonical title to search (e.g., 'The Matrix', 'Blood on the Clocktower')>",
      "url": "<URL if user provided one>"
    }
  }
]
\`\`\`

(OMIT fields that would be null - don't include them. placeName and placeQuery are mutually exclusive - prefer placeName for canonical places.)`
}

const SHARED_IMAGE_SECTION = `IMAGE HINTS (image.stock is ALWAYS required):
image.stock: Stock photo query - ALWAYS REQUIRED. Be specific! Include location/context when relevant.
image.mediaKey: Media library key for the activity type (e.g., "hot air balloon", "restaurant").
image.preferStock: Set to true when stock query is MORE SPECIFIC than a generic mediaKey image.

WHEN TO USE preferStock:
- preferStock:true → "hot air balloon in Cappadocia" - stock photo of Cappadocia is better than generic balloon
- preferStock:false (or omit) → "go to a restaurant" - generic restaurant image is fine, save API call

The pipeline tries: mediaKey (if preferStock=false) → stock API → mediaKey (if preferStock=true) → category default`

function buildLocationSection(homeCountry: string): string {
  return `LOCATION FIELDS (fill only if explicitly mentioned):
wikiName: Wikipedia topic for bands/games/concepts with CC images. NOT for movies/books (use link instead).
placeName: Canonical place with Wikipedia article (e.g., "Waiheke Island", "Mount Fuji"). Clean names only.
placeQuery: ONE SPECIFIC business/POI for Google Places (e.g., "Dice Goblin Auckland"). Must be unambiguous.
city/region/country: Fill if explicitly mentioned. For ambiguous names, assume ${homeCountry}.
RULES: placeName and placeQuery are MUTUALLY EXCLUSIVE. Never guess venues.
IMPORTANT: placeQuery is ONLY for a specific named business. "geothermal park in Rotorua" is NOT a placeQuery - there are many parks. Use city:"Rotorua" + image.object:"geothermal park" instead.`
}

const SHARED_CATEGORIES_SECTION = `CATEGORIES: ${VALID_CATEGORIES.join(', ')}
("other" should be used only as a last resort. Only use it if no other category applies.)`

const SHARED_NORMALIZATION = `NORMALIZATION:
- Keep distinct categories: cafe≠restaurant, bar≠restaurant
- KEEP SPECIFICITY in image.mediaKey: Don't strip qualifying words:
  - "glow worm caves" → mediaKey:"glow worm cave" (NOT just "cave")
  - "hot air balloon" → mediaKey:"hot air balloon" (NOT just "balloon")
  - "escape room" → mediaKey:"escape room" (NOT just "room")
- DISAMBIGUATION: Use context to pick the right mediaKey:
  - "play pool" or "shoot pool" → mediaKey:"billiards" (the cue game, NOT swimming pool)
  - "swim in pool" → mediaKey:"swimming pool"
- Regional terms are handled by our system - just use the term from the message`

const SHARED_COMPOUND_SECTION = `COMPOUND vs MULTIPLE: For complex activities that one JSON object can't fully represent (e.g., "Go to Iceland and see the aurora"), emit ONE object. For truly separate activities, emit multiple objects.`

// Examples from IMAGES.md - used by both suggestion and agreement prompts
const SHARED_EXAMPLES = `EXAMPLES:
1. "let's go to Paris" → city:"Paris", country:"France", cat:"travel", image:{stock:"paris france eiffel tower", mediaKey:"city", preferStock:true}
2. "trip to Waiheke" → placeName:"Waiheke Island", region:"Auckland", country:"New Zealand", image:{stock:"waiheke island beach vineyard", mediaKey:"island", preferStock:true}
3. "board games at Dice Goblin" → placeQuery:"Dice Goblin Auckland", cat:"gaming", image:{stock:"board game cafe meetup", mediaKey:"board game", preferStock:true}
4. "see Infected Mushroom in Auckland" → wikiName:"Infected Mushroom", city:"Auckland", cat:"music", image:{stock:"psytrance rave edm concert", mediaKey:"concert", preferStock:true}
5. "visit geothermal park in Rotorua" → city:"Rotorua", cat:"nature", image:{stock:"rotorua mud pools geyser geothermal", mediaKey:"geothermal park", preferStock:true}
6. "watch The Matrix" → cat:"entertainment", link:{type:"movie", query:"The Matrix"}, image:{stock:"movie night popcorn", mediaKey:"movie night"}
7. "go to the theatre" → cat:"entertainment", image:{stock:"theatre stage performance", mediaKey:"theatre"}
8. "hot air balloon ride" (generic) → cat:"experiences", image:{stock:"hot air balloon sunrise", mediaKey:"hot air balloon"}
9. "hot air balloon in Turkey" → country:"Turkey", cat:"experiences", image:{stock:"cappadocia hot air balloon sunrise", mediaKey:"hot air balloon", preferStock:true}`

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

${buildLocationSection(context.homeCountry)}

${SHARED_IMAGE_SECTION}

${SHARED_CATEGORIES_SECTION}

${SHARED_NORMALIZATION}

${SHARED_EXAMPLES}

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

${buildLocationSection(context.homeCountry)}

${SHARED_IMAGE_SECTION}

${SHARED_CATEGORIES_SECTION}

${SHARED_NORMALIZATION}

EXAMPLES:
- Context: "Wanna do a whale safari?" then >>> "That sounds amazing!"
  → off:-1, image:{stock:"whale safari boat ocean", mediaKey:"whale watching"}
- Context: "Let's go hiking" then "What about Saturday?" then >>> "Perfect!"
  → off:-2, image:{stock:"hiking trail nature forest", mediaKey:"hiking"}
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

// ============================================================================
// PROMPT SIGNATURE (for cache invalidation)
// ============================================================================

import { createHash } from 'node:crypto'

/** Cached prompt signature - computed lazily on first use */
let cachedPromptSignature: string | null = null

/**
 * Get a stable hash of the prompt template.
 *
 * Uses an "eigenprompt" approach: generates a prompt from a dummy candidate
 * and hashes it. Any change to prompt structure/constants will change the hash.
 *
 * Computed lazily and cached for the lifetime of the process.
 */
export function getPromptSignature(): string {
  if (cachedPromptSignature) return cachedPromptSignature

  // Create a dummy candidate that exercises ALL prompt logic paths
  const dummyContext: ContextMessage = {
    id: 0,
    timestamp: new Date('2000-01-01T00:00:00Z'),
    sender: 'Y',
    content: 'Y'
  }
  const dummyCandidate: CandidateMessage = {
    messageId: 0,
    timestamp: new Date('2000-01-01T00:00:00Z'),
    sender: 'X',
    content: 'X',
    source: { type: 'regex', pattern: 'X' },
    confidence: 1,
    candidateType: 'suggestion',
    contextBefore: [dummyContext],
    contextAfter: [dummyContext]
  }

  // Build both prompt types to capture all template variations
  const suggestionPrompt = buildClassificationPrompt(
    [dummyCandidate],
    { homeCountry: 'X' },
    'suggestion'
  )
  const agreementPrompt = buildClassificationPrompt(
    [dummyCandidate],
    { homeCountry: 'X' },
    'agreement'
  )
  // Hash the combined prompts - first 8 chars is enough for cache busting
  const combined = suggestionPrompt + agreementPrompt
  cachedPromptSignature = createHash('sha256').update(combined).digest('hex').slice(0, 8)
  return cachedPromptSignature
}
