/**
 * Tuple Extraction for Semantic Clustering
 *
 * Extracts a 3-tuple (nouns[], verbs[], location) from activity strings.
 * This enables semantic matching without embedding the full sentence.
 *
 * Key rules:
 * - Ambiguous words (bike, hike) go in BOTH noun and verb arrays
 * - Stop words are filtered out
 * - Location comes from the AI-extracted location field (not parsed from activity)
 * - (null, null, null) tuples indicate no meaningful content
 */

import nlp from 'compromise'
import pluralize from 'pluralize'
import WordPOS from 'wordpos'

const wordpos = new WordPOS()

/**
 * Words to filter out - common English stop words plus activity-specific ones.
 * These don't carry semantic meaning for activity clustering.
 */
export const STOP_WORDS = new Set([
  // Articles and prepositions
  'a',
  'an',
  'the',
  'to',
  'for',
  'on',
  'in',
  'at',
  'of',
  'with',
  'by',
  // Common verbs that don't define the activity
  'go',
  'do',
  'take',
  'have',
  'be',
  'get',
  'make',
  'let',
  'try',
  'check',
  // Pronouns
  'i',
  'we',
  'you',
  'they',
  'it',
  'that',
  'this',
  'some',
  'out',
  // Conjunctions
  'and',
  'or',
  'but',
  'so',
  'if',
  'then',
  // Be verbs
  'is',
  'are',
  'was',
  'were',
  'been',
  'being',
  // Time words (don't affect activity identity)
  'today',
  'tomorrow',
  'tonight',
  'morning',
  'afternoon',
  'evening',
  // Vague modifiers
  'again',
  'soon',
  'sometime',
  'somewhere',
  'together',
  'new',
  'next',
  'one',
  'day',
  'week',
  'weekend',
  'year'
])

/**
 * 3-tuple representing the semantic content of an activity.
 * - nouns: core objects/things (bike, restaurant, movie)
 * - verbs: core actions (ride, eat, watch)
 * - location: where (null means no specific location)
 */
export interface SemanticTuple {
  readonly nouns: readonly string[] | null
  readonly verbs: readonly string[] | null
  readonly location: string | null
}

/**
 * Lemmatize a word to its base form.
 * Uses compromise for verb/noun normalization, with pluralize as fallback.
 */
export function lemmatize(word: string): string {
  const doc = nlp(word)
  const verb = doc.verbs().toInfinitive().text()
  if (verb) return verb.toLowerCase()
  const noun = doc.nouns().toSingular().text()
  if (noun) return noun.toLowerCase()
  return pluralize.singular(word.toLowerCase())
}

/** Check if a lemma can be a noun using WordPOS. */
export async function isNoun(lemma: string): Promise<boolean> {
  return wordpos.isNoun(lemma)
}

/** Check if a lemma can be a verb using WordPOS. */
export async function isVerb(lemma: string): Promise<boolean> {
  return wordpos.isVerb(lemma)
}

/** Tokenize activity string into words. */
function tokenize(activity: string): string[] {
  return activity
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
}

/** Filter and lemmatize words, removing stop words. */
function extractLemmas(words: string[]): string[] {
  const lemmas: string[] = []
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue
    const lemma = lemmatize(word)
    if (!STOP_WORDS.has(lemma)) {
      lemmas.push(lemma)
    }
  }
  return lemmas
}

/** Find position of first article (a/an/the) in text, or -1 if none. */
function findArticlePosition(text: string): number {
  const match = /\b(a|an|the)\b/i.exec(text)
  return match ? match.index : -1
}

/** Find position of first content word in original activity string. */
function findFirstContentWordPosition(
  activity: string,
  words: string[],
  firstLemma: string
): number {
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue
    if (lemmatize(word) === firstLemma) {
      return activity.toLowerCase().indexOf(word)
    }
  }
  return -1
}

/** Normalize location hint to lowercase, removing parenthetical content. */
function normalizeLocation(locationHint: string | null | undefined): string | null {
  if (!locationHint) return null
  const cleaned = locationHint
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .trim()
  return cleaned && cleaned !== 'unspecified' ? cleaned : null
}

/** Classify a lemma as noun/verb and add to appropriate arrays. */
async function classifyAndAddWord(
  lemma: string,
  index: number,
  firstWordIsVerb: boolean,
  nouns: string[],
  verbs: string[]
): Promise<void> {
  const [wordIsNoun, wordIsVerb] = await Promise.all([isNoun(lemma), isVerb(lemma)])

  if (firstWordIsVerb && index === 0 && wordIsVerb) {
    verbs.push(lemma)
    nouns.push(lemma)
  } else if (wordIsNoun) {
    nouns.push(lemma)
  } else if (wordIsVerb) {
    verbs.push(lemma)
  } else {
    nouns.push(lemma)
  }
}

/**
 * Extract a semantic tuple from an activity string.
 *
 * @param activity - The activity description (e.g., "Go for a bike ride")
 * @param locationHint - Pre-extracted location from AI classifier (optional)
 * @returns The semantic tuple (nouns[], verbs[], location)
 *
 * Examples:
 * - "Go for a bike ride" → ([bike,ride], null, null)
 * - "Ride a bike" → ([bike,ride], [ride], null)
 * - "Go biking" → ([bike], null, null)
 * - "Hike in Queenstown", "Queenstown" → ([hike], null, "queenstown")
 */
export async function extractTuple(
  activity: string,
  locationHint?: string | null
): Promise<SemanticTuple> {
  const words = tokenize(activity)
  const lemmas = extractLemmas(words)

  const nouns: string[] = []
  const verbs: string[] = []

  // Determine if first word should be treated as verb
  // (only if it appears BEFORE an article like "Ride a bike")
  const articlePos = findArticlePosition(activity)
  const firstLemma = lemmas[0]
  const firstContentWordPos = firstLemma
    ? findFirstContentWordPosition(activity, words, firstLemma)
    : -1
  const firstWordIsVerb =
    articlePos > 0 && firstContentWordPos >= 0 && firstContentWordPos < articlePos

  // Classify each lemma
  await Promise.all(
    lemmas.map((lemma, i) => classifyAndAddWord(lemma, i, firstWordIsVerb, nouns, verbs))
  )

  return {
    nouns: nouns.length > 0 ? [...new Set(nouns)].sort() : null,
    verbs: verbs.length > 0 ? [...new Set(verbs)].sort() : null,
    location: normalizeLocation(locationHint)
  }
}

/**
 * Check if a tuple represents "empty" content that should be filtered.
 */
export function isEmptyTuple(tuple: SemanticTuple): boolean {
  return tuple.nouns === null && tuple.verbs === null && tuple.location === null
}

/**
 * Format a tuple for display/debugging.
 */
export function formatTuple(tuple: SemanticTuple): string {
  const nouns = tuple.nouns ? `[${tuple.nouns.join(',')}]` : 'null'
  const verbs = tuple.verbs ? `[${tuple.verbs.join(',')}]` : 'null'
  const loc = tuple.location ?? 'null'
  return `(N:${nouns}, V:${verbs}, L:${loc})`
}
