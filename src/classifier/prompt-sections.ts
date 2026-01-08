/**
 * Shared Prompt Sections
 *
 * Reusable prompt sections used by both suggestion and agreement prompts.
 */

import { VALID_CATEGORIES } from '../categories'
import { VALID_LINK_TYPES } from '../search/types'

export const SHARED_INCLUDE_RULES = `INCLUDE (output these):
- Named places: restaurants, cafes, food trucks, bars, venues, parks, trails
- Specific activities: hiking, kayaking, concerts, movies, shows
- Travel plans: trips, destinations, hotels, Airbnb
- Events: festivals, markets, concerts, exhibitions
- Things to do: hobbies, experiences, skills, sports, games
- Generic but actionable: "Let's go to a cafe" (specific type of place)`

export const SHARED_TENSE_RULES = `CRITICAL - ONLY FUTURE SUGGESTIONS:
We want IDEAS for things to do in the future - NOT things already happening or already done.

✅ SUGGESTIONS (include): "We should go to X", "Let's try X", "Want to visit X?", "X looks cool"
❌ PRESENT (skip): "I'm going to X", "I'm at X now", "Heading to X", "Going to get Y"
❌ PAST (skip): "I went to X", "I was at X yesterday", "We did X last week"

Even if a message contains a Google Maps link or place name, SKIP IT if the person is describing what they're doing RIGHT NOW or what they already did. We only want future plans and suggestions.

Examples:
- "I'm going to the shops" → SKIP (present action, not a suggestion)
- "I'm going here to get some boxes [maps link]" → SKIP (current errand, even with link)
- "Let's go to the department store sometime" → INCLUDE (future suggestion)
- "We should check out this place [maps link]" → INCLUDE (suggestion with link)`

export const SHARED_SKIP_RULES = `SKIP (don't output):
- Vague: "wanna go out?", "do something fun", "go somewhere"
- Logistics: "leave at 3:50pm", "skip the nachos"
- Questions: "where should we go?"
- Links without clear discussion about visiting/attending
- Errands: groceries, vet, mechanic, cleaning, picking up items
- Work/appointments/chores
- Romantic/intimate, adult content
- Sad or stressful: funerals, hospitals, work deadlines, financial worries
- Sensitive: potential secrets, embarrassing messages, offensive content, or illegal activities
- Unclear references: "go there again" (where?), "check it out" (what?)`

export const SHARED_IMAGE_SECTION = `IMAGE HINTS:
image.stock: ALWAYS REQUIRED - specific stock photo query with location context when relevant.
image.mediaKey: Media library key (e.g., "hot air balloon", "restaurant").
image.preferStock: true if stock is more specific than mediaKey (e.g., "balloon in Cappadocia" vs generic balloon).`

export const SHARED_LINK_SECTION = `LINK HINTS (specific media titles only): Types: ${VALID_LINK_TYPES.join(', ')}
- "watch Oppenheimer" → link:{type:"movie", query:"Oppenheimer"}
- "watch The Bear" → link:{type:"tv_show", query:"The Bear"}
- "play Wingspan" → link:{type:"physical_game", query:"Wingspan"}
- "play Baldur's Gate 3" → link:{type:"video_game", query:"Baldur's Gate 3"}
Use "media" when UNSURE if movie or TV show. Use "game" when UNSURE if video game or board game.
DON'T use for: generic ("go to movies"), places (use placeName), bands (use wikiName).`

export const SHARED_CATEGORIES_SECTION = `CATEGORIES: ${VALID_CATEGORIES.join(', ')}
("other" should be used only as a last resort. Only use it if no other category applies.)`

export const SHARED_NORMALIZATION = `NORMALIZATION:
- Distinct categories: cafe≠restaurant, bar≠restaurant
- KEEP mediaKey specificity: "glow worm cave" not "cave", "hot air balloon" not "balloon"
- Disambiguation: "play pool"→"billiards" (cue game), "swim in pool"→"swimming pool"`

export const SHARED_COMPOUND_SECTION = `COMPOUND vs MULTIPLE: For complex activities that one JSON object can't fully represent (e.g., "Go to Iceland and see the aurora"), emit ONE object. For truly separate activities, emit multiple objects.`

// Examples from IMAGES.md - used by both suggestion and agreement prompts
export const SHARED_EXAMPLES = `EXAMPLES:
1. "let's go to Paris" → city:"Paris", country:"France", cat:"travel", image:{stock:"paris france eiffel tower", mediaKey:"city", preferStock:true}
2. "trip to Waiheke" → placeName:"Waiheke Island", region:"Auckland", country:"New Zealand", image:{stock:"waiheke island beach vineyard", mediaKey:"island", preferStock:true}
3. "board games at Dice Goblin" → placeQuery:"Dice Goblin Auckland", cat:"gaming", image:{stock:"board game cafe meetup", mediaKey:"board game", preferStock:true}
4. "see Infected Mushroom in Auckland" → wikiName:"Infected Mushroom", city:"Auckland", cat:"music", image:{stock:"psytrance rave edm concert", mediaKey:"concert", preferStock:true}
5. "visit geothermal park in Rotorua" → city:"Rotorua", cat:"nature", image:{stock:"rotorua mud pools geyser geothermal", mediaKey:"geothermal park", preferStock:true}
6. "watch The Matrix" → cat:"entertainment", link:{type:"movie", query:"The Matrix"}, image:{stock:"movie night popcorn", mediaKey:"movie night"}
7. "watch Severance" (unsure if movie/TV) → cat:"entertainment", link:{type:"media", query:"Severance"}, image:{stock:"tv show streaming", mediaKey:"movie night"}
8. "play Exploding Kittens" (unsure if video/board game) → cat:"gaming", link:{type:"game", query:"Exploding Kittens"}, image:{stock:"card game friends", mediaKey:"card game"}
9. "go to the theatre" → cat:"entertainment", image:{stock:"theatre stage performance", mediaKey:"theatre"}
10. "hot air balloon ride" (generic) → cat:"experiences", image:{stock:"hot air balloon sunrise", mediaKey:"hot air balloon"}
11. "hot air balloon in Turkey" → country:"Turkey", cat:"experiences", image:{stock:"cappadocia hot air balloon sunrise", mediaKey:"hot air balloon", preferStock:true}`

export function buildUserContextSection(homeCountry: string, timezone?: string): string {
  const timezoneInfo = timezone ? `\nTimezone: ${timezone}` : ''
  return `USER CONTEXT:
Home country: ${homeCountry}${timezoneInfo}`
}

export function buildJsonSchemaSection(includeOffset: boolean): string {
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

    // Link hints (for resolving media entities to canonical URLs) - use for movies, books, games, music, etc.
    "link": {
      "type": "<${VALID_LINK_TYPES.join('|')}>",
      "query": "<canonical title (e.g., 'The Matrix', 'Project Hail Mary', 'Wingspan')>"
    }
  }
]
\`\`\`

(OMIT fields that would be null - don't include them. placeName and placeQuery are mutually exclusive - prefer placeName for canonical places.)`
}

export function buildLocationSection(homeCountry: string): string {
  return `LOCATION FIELDS (only if explicitly mentioned):
wikiName: Wikipedia topic for bands/games/concepts (NOT movies/books - use link).
placeName: Canonical place with Wikipedia article (e.g., "Waiheke Island"). Mutually exclusive with placeQuery.
placeQuery: SPECIFIC named business for Google Places (e.g., "Dice Goblin Auckland"). NOT generic searches.
city/region/country: For ambiguous names, assume ${homeCountry}.`
}
