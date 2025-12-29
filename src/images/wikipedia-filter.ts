/**
 * AI-powered image relevance filter for Wikipedia images.
 *
 * Uses Gemini to evaluate whether Wikipedia images (based on captions/descriptions)
 * are suitable for representing an activity, filtering out:
 * - Diagrams, charts, maps, and infographics
 * - Logos, emblems, and icons
 * - Historical/archival black-and-white photos
 * - Equipment close-ups without activity context
 * - Portraits of notable people
 *
 * Wikipedia is an encyclopedia - most images are informative/educational.
 * We only want images showing the activity being done, the objects involved,
 * or the places where that activity happens.
 */

import { callGemini } from './gemini-client'

/**
 * Wikipedia image candidate for filtering.
 */
export interface WikipediaImageCandidate {
  /** Filename from Wikipedia (e.g., "Duckpins_closeup.jpg") */
  readonly filename: string
  /** Image description/caption from Wikipedia */
  readonly description: string
  /** URL to the image */
  readonly url: string
}

/**
 * Result of AI filtering - images suitable for activity display.
 */
export interface WikipediaImageMatch {
  /** Wikipedia filename */
  readonly filename: string
  /** Image URL */
  readonly url: string
  /** Confidence score 0-100 */
  readonly confidence: number
}

/**
 * Filter Wikipedia images for suitability as activity photos.
 * Returns only matching images with confidence scores.
 *
 * @param activity - The activity being represented (e.g., "Eiffel Tower", "hiking")
 * @param candidates - Wikipedia images with descriptions
 * @param apiKey - Google AI API key (Gemini)
 * @returns Suitable images sorted by confidence (highest first)
 */
export async function filterWikipediaImages(
  activity: string,
  candidates: readonly WikipediaImageCandidate[],
  apiKey: string
): Promise<WikipediaImageMatch[]> {
  if (candidates.length === 0) {
    return []
  }

  const prompt = buildFilterPrompt(activity, candidates)
  const response = await callGemini(prompt, apiKey)

  if (!response) {
    return []
  }

  const matches = parseFilterResponse(response, candidates)
  return matches.sort((a, b) => b.confidence - a.confidence)
}

function buildFilterPrompt(term: string, candidates: readonly WikipediaImageCandidate[]): string {
  const candidateList = candidates
    .map((c, i) => `${i}: "${c.filename}" - ${c.description || '(no description)'}`)
    .join('\n')

  return `You are filtering Wikipedia images for: "${term}"

This is for a "things to do" app - we need photos showing activities people can do for fun.

CRITICAL: Wikipedia is an encyclopedia. Most images are NOT suitable because they are:
- Diagrams, charts, maps, infographics, or technical illustrations
- Logos, emblems, coats of arms, or icons
- Historical black-and-white or archival photos
- Close-ups of equipment without activity context
- Portraits of notable people (athletes, inventors, etc.)
- Trophy/award photos
- Organizational charts or timelines

INCLUDE ONLY images that show:
- People actively doing "${term}" (the activity in progress)
- The venue/location where "${term}" happens
- The objects/equipment being USED in context (not isolated)

THINK: Would this image help someone visualize themselves doing "${term}"?

Return a JSON array of matches. Each match has "index" (number 0-${candidates.length - 1}) and "confidence" (0-100).
Confidence = how well the image represents "${term}" as a fun activity to do.
Be STRICT - most Wikipedia images should be skipped.

Example response:
[{"index": 0, "confidence": 85}, {"index": 2, "confidence": 70}]

If NO images are suitable, return an empty array: []

Images to evaluate:
${candidateList}

JSON:`
}

function parseFilterResponse(
  response: string,
  candidates: readonly WikipediaImageCandidate[]
): WikipediaImageMatch[] {
  try {
    const parsed: unknown = JSON.parse(response)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item): item is { index: number; confidence: number } =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).index === 'number' &&
          typeof (item as Record<string, unknown>).confidence === 'number' &&
          (item as { index: number }).index >= 0 &&
          (item as { index: number }).index < candidates.length
      )
      .map((item) => {
        // Filter already validated index is within bounds
        const candidate = candidates[item.index]
        // This guard satisfies TypeScript though it should never trigger
        if (!candidate) {
          return null
        }
        return {
          filename: candidate.filename,
          url: candidate.url,
          confidence: Math.min(100, Math.max(0, item.confidence))
        }
      })
      .filter((item): item is WikipediaImageMatch => item !== null)
  } catch {
    return []
  }
}
