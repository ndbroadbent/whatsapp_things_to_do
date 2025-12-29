/**
 * AI-powered image relevance filter for Pixabay search results.
 *
 * Uses Gemini to evaluate whether images (based on tags/metadata)
 * genuinely represent a target activity, filtering out:
 * - Tangential keyword matches (coral necklace when searching "jewelry making")
 * - Cultural/documentary photos instead of activity photos
 * - Objects without activity context (a nut tagged with "jewelry making")
 * - Model photos where the activity is incidental (portrait with jewelry)
 */

import { callGemini } from './gemini-client'

/**
 * Image candidate from Pixabay search results.
 */
export interface PixabayImageCandidate {
  /** Unique identifier (Pixabay ID) */
  readonly id: number
  /** Comma-separated tags from Pixabay */
  readonly tags: string
}

/**
 * Result of AI filtering - images that match the activity.
 */
export interface PixabayImageMatch {
  /** Pixabay image ID */
  readonly id: number
  /** Confidence score 0-100 */
  readonly confidence: number
}

/**
 * Filter a batch of Pixabay image candidates for relevance to a target activity.
 * Returns only matching images with confidence scores.
 *
 * @param activity - The activity being searched for (e.g., "swimming", "sushi")
 * @param candidates - Pixabay search results with tags
 * @param apiKey - Google AI API key (Gemini)
 * @returns Matching images sorted by confidence (highest first)
 */
export async function filterPixabayImages(
  activity: string,
  candidates: readonly PixabayImageCandidate[],
  apiKey: string
): Promise<PixabayImageMatch[]> {
  if (candidates.length === 0) {
    return []
  }

  const prompt = buildFilterPrompt(activity, candidates)
  const response = await callGemini(prompt, apiKey)

  if (!response) {
    // On API failure, return empty (fail closed for quality)
    return []
  }

  const matches = parseFilterResponse(response)
  return matches.sort((a, b) => b.confidence - a.confidence)
}

function buildFilterPrompt(term: string, candidates: readonly PixabayImageCandidate[]): string {
  const candidateList = candidates.map((c) => `ID ${c.id}: ${c.tags}`).join('\n')

  return `You are filtering stock photo search results for: "${term}"

This is for a "things to do" app - activities people can go out and do for fun.
Think carefully about what "${term}" means in this context and use ALL the tags as context clues.

THINK: What activity does "${term}" represent? What would a good image of that activity show?

INCLUDE images where:
- The tags clearly indicate the image shows the ACTIVITY itself
- People doing the activity, or the venue/location for the activity
- The term is the PRIMARY SUBJECT, not incidental

SKIP images where:
- Tags reveal the image is about something ELSE that just shares the keyword
  Example: "facial" means spa treatment, NOT "facial expression" photos
  If tags say "facial expression, emotion, angry, portrait" → SKIP (this is about expressions, not spa)
- The term appears as a secondary/contextual tag but the image is OF something else
  Example: "juice bar" tag on a coconut → SKIP (image is of a coconut, not a juice bar)
- Tags suggest a portrait/model photo where the activity is incidental
- Tags indicate cultural/documentary/historical content rather than recreational

Use context clues from ALL tags to understand what the image actually shows.
Don't just match keywords - understand the meaning.

Return a JSON array of matches. Each match has "id" (number) and "confidence" (0-100).
Confidence = how certain the image genuinely represents "${term}" as an activity.
Only include images that would help someone visualize doing "${term}". Skip all others.

Example response:
[{"id": 123, "confidence": 95}, {"id": 456, "confidence": 80}]

Candidates:
${candidateList}

JSON:`
}

function parseFilterResponse(response: string): PixabayImageMatch[] {
  try {
    const parsed: unknown = JSON.parse(response)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item): item is { id: number; confidence: number } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).id === 'number' &&
          typeof (item as Record<string, unknown>).confidence === 'number'
      )
      .map((item) => ({
        id: item.id,
        confidence: Math.min(100, Math.max(0, item.confidence))
      }))
  } catch {
    return []
  }
}
