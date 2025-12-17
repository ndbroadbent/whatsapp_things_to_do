/**
 * Classification Prompt
 *
 * AI prompt for classifying candidate messages as activities.
 */

import type { CandidateMessage } from '../types.js'

/**
 * Build context string from surrounding messages.
 */
function formatContext(candidate: CandidateMessage): string {
  if (!candidate.context) {
    return `>>> ${candidate.sender}: ${candidate.content}`
  }

  // The context already includes surrounding messages
  // We need to mark the target message
  const lines = candidate.context.split('\n')
  const result: string[] = []

  for (const line of lines) {
    // Check if this line contains the candidate message
    if (line.includes(candidate.content.slice(0, 50))) {
      result.push(`>>> ${line}`)
    } else {
      result.push(`    ${line}`)
    }
  }

  // If we couldn't find the message in context, add it
  if (!result.some((l) => l.startsWith('>>>'))) {
    result.push(`>>> ${candidate.sender}: ${candidate.content}`)
  }

  return result.join('\n')
}

/**
 * Build the classification prompt for a batch of candidates.
 */
export function buildClassificationPrompt(candidates: readonly CandidateMessage[]): string {
  const messagesText = candidates
    .map((candidate, index) => {
      const context = formatContext(candidate)
      return `
---
MESSAGE #${index + 1} (ID: ${candidate.messageId})
Context:
${context}
---`
    })
    .join('\n')

  return `You are analyzing chat messages between people. Your task is to identify messages that suggest "things to do" - activities, places to visit, events to attend, trips to take, etc.

For each message marked with >>>, determine:
1. Is this a suggestion for something to do together? (yes/no)
2. If yes, what is the activity/thing to do?
3. If yes, what location is mentioned (if any)?
4. Activity score: 0.0 (errand like vet/mechanic) to 1.0 (fun activity)
5. Category: restaurant, cafe, bar, hike, nature, beach, trip, hotel, event, concert, museum, entertainment, adventure, family, errand, appointment, other
6. Is mappable: Can this be pinned on a map? (yes if specific location like "Queenstown", "Coffee Lab", Google Maps URL; no if general idea like "see a movie", "go kayaking" without a specific venue)

Focus on:
- Suggestions to visit places (restaurants, beaches, parks, cities)
- Activities to try (hiking, kayaking, concerts, shows)
- Travel plans (trips, hotels, Airbnb)
- Events to attend (festivals, markets, movies)
- Experiences to have ("we should try...", "let's go to...")

Ignore:
- Mundane tasks (groceries, cleaning, work)
- Past events (things they already did)
- Vague statements without actionable suggestions
- Just sharing links without suggesting to go/do something

${messagesText}

Respond in this exact JSON format (array of objects, one per message analyzed):
\`\`\`json
[
  {
    "message_id": <id>,
    "is_activity": true/false,
    "activity": "<what to do - null if not a suggestion>",
    "location": "<place/location mentioned - null if none or not a suggestion>",
    "activity_score": <0.0-1.0>,
    "category": "<category>",
    "confidence": <0.0-1.0 how confident you are>,
    "is_mappable": true/false
  }
]
\`\`\`

Include ALL messages in your response (both activities and non-activities).
Be concise with activity descriptions (under 100 chars).
For location, extract specific place names if mentioned.`
}

/**
 * Parse the classification response from the AI.
 */
export function parseClassificationResponse(response: string): Array<{
  message_id: number
  is_activity: boolean
  activity: string | null
  location: string | null
  activity_score: number
  category: string
  confidence: number
  is_mappable: boolean
}> {
  // Try to extract JSON from response (might be wrapped in ```json```)
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/)
  let jsonStr: string

  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1]
  } else {
    // Try to find JSON array directly
    const arrayMatch = response.match(/\[[\s\S]*\]/)
    if (!arrayMatch) {
      throw new Error('Could not find JSON array in response')
    }
    jsonStr = arrayMatch[0]
  }

  const parsed = JSON.parse(jsonStr) as unknown

  if (!Array.isArray(parsed)) {
    throw new Error('Response is not an array')
  }

  return parsed.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Array item is not an object')
    }

    const obj = item as Record<string, unknown>

    // Default is_mappable based on whether location is present
    const location = typeof obj.location === 'string' ? obj.location : null
    const defaultMappable = location !== null && location.trim().length > 0

    return {
      message_id: typeof obj.message_id === 'number' ? obj.message_id : 0,
      is_activity: obj.is_activity === true,
      activity: typeof obj.activity === 'string' ? obj.activity : null,
      location,
      activity_score:
        typeof obj.activity_score === 'number' ? Math.max(0, Math.min(1, obj.activity_score)) : 0.5,
      category: typeof obj.category === 'string' ? obj.category : 'other',
      confidence:
        typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.5,
      is_mappable: typeof obj.is_mappable === 'boolean' ? obj.is_mappable : defaultMappable
    }
  })
}
